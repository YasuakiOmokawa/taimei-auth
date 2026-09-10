import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { Cause, Clock, Data, Effect, Ref } from "effect";
import { AuthApi } from "../auth-service";
import { isMfaChallengeEnabled } from "../mfa/kill-switch";
import { FALLBACK_REDIRECT } from "../mfa/redirect-guard";
import { mfaChallengeRequired } from "../mfa/totp/challenge-required";
import { type LoginChallengeCookie, openLoginChallenge } from "../mfa/totp/login-challenge";
import { captureCause, SentryService } from "../sentry";
import {
  type AuthRouteMatch,
  isPrimaryAuthRoute,
  resolvePrimaryAuthMethod,
} from "./primary-auth-routes";

// 一次認証成功後の after-hook にチャレンジ強制を差し込む自前プラグイン (設計: ADR-0016)。
// チャレンジ要否は自前 mfa_totp 行から導出する (+1 SELECT。secret 列に触れない射影 — D5)。

const MFA_CHALLENGE_PAGE = "/auth/mfa";
const SENTRY_TAGS = { component: "mfa-challenge" } as const;

// 止めている間は鳴り続ける (1 回きりだと warm isolate が黙る: ADR-0013 Consequences → 0016 が引き継ぐ)。
// 6 時間はオンコール交代を必ず 1 回またぐ粒度。
export const KILL_SWITCH_REPORT_INTERVAL_MS = 6 * 60 * 60 * 1000;

const killSwitchReportedAt = Ref.makeUnsafe(0);

// hook が program に渡す面。ctx 由来の副作用 (cookie 書き込み・session 破棄) は callback で受け取る。
type IssuedSession = {
  userId: string;
  sessionToken: string;
  route: AuthRouteMatch;
  // 一次認証経路は `throw ctx.redirect(...)` で終わり、dispatch が location を responseHeaders へ載せてから
  // after-hook を呼ぶ。クエリから組み直すと newUserCallbackURL 差し替えと絶対化の再現が要る。
  location: string | null | undefined;
  setCookie(cookie: LoginChallengeCookie): void;
  // 失敗しない cookie クリア。後段 (Upstash REST の DEL、リトライ無し) が落ちてもブラウザに使える
  // セッション cookie を残さない。upstream より前に出すのは、後段が落ちた時に sign-in-observer が
  // チャレンジ未通過のセッションを記帳するのを防ぐため。
  dropIssuedSession(): void;
};

// 未知 route は既定値に寄せず失敗にする (寄せると誤った method の sign_in audit が積まれる)。
class UnmappedPrimaryAuthRoute extends Data.TaggedError("UnmappedPrimaryAuthRoute")<{
  readonly route: AuthRouteMatch;
}> {
  // Sentry は Error の name / message しか載せない (ExtraErrorData 未設定) ので route を message に畳む。
  override get message() {
    return `mfa-challenge: unmapped primary auth route ${this.route.path} (id=${this.route.params?.id})`;
  }
}

// log: true は Info になるので Error を明示する (旧 console.error 相当)。
const bestEffort = Effect.ignoreCause({ log: "Error" });

const reportFailure = (cause: Cause.Cause<unknown>) =>
  bestEffort(captureCause({ tags: SENTRY_TAGS })({ cause: Cause.squash(cause) }));

const reportKillSwitchPeriodically = Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis;
  const due = yield* Ref.modify(killSwitchReportedAt, (last): readonly [boolean, number] =>
    now - last < KILL_SWITCH_REPORT_INTERVAL_MS ? [false, last] : [true, now],
  );
  if (!due) return;
  yield* bestEffort(
    SentryService.use((sentry) =>
      sentry.captureMessage("mfa: challenge enforcement disabled by kill switch", {
        level: "warning",
        tags: SENTRY_TAGS,
      }),
    ),
  );
});

const handOffToChallenge = Effect.fn("auth.handOffToMfaChallenge")(function* (
  input: IssuedSession,
) {
  const method = resolvePrimaryAuthMethod(input.route);
  if (!method) return yield* new UnmappedPrimaryAuthRoute({ route: input.route });
  const cookie = yield* openLoginChallenge({
    userId: input.userId,
    redirectUrl: input.location ?? FALLBACK_REDIRECT,
    method,
  });
  input.setCookie(cookie);
  input.dropIssuedSession();
  yield* AuthApi.use((authApi) => authApi.deleteSession(input.sessionToken));
});

// E = never: 倒し方は全てここで決める (fail-closed の正本: ADR-0016)
export const enforceChallenge = Effect.fn("auth.enforceMfaChallenge")(function* (
  input: IssuedSession,
) {
  if (!isMfaChallengeEnabled(process.env.MFA_CHALLENGE_ENABLED)) {
    yield* reportKillSwitchPeriodically;
    return "pass" as const;
  }
  // 判定の +1 SELECT が読めない時も fail-closed — 素通しすると after-hook が一次認証ごと 500 にする
  // (MFA 無効ユーザー含む)。チャレンジ画面へ倒し、再ログインに誘導する。
  const required = yield* mfaChallengeRequired(input.userId).pipe(
    Effect.catchCause((cause) => reportFailure(cause).pipe(Effect.as(true))),
  );
  if (!required) return "pass" as const;
  // 介入を決めた後の失敗は全て fail-closed — セッション cookie を落としたまま同じチャレンジ画面へ倒す
  // (未成立なら画面が再ログイン導線を出す)。cookie クリアを観測より先に置く。
  yield* handOffToChallenge(input).pipe(
    Effect.catchCause((cause) =>
      Effect.andThen(Effect.sync(input.dropIssuedSession), reportFailure(cause)),
    ),
  );
  return "challenge" as const;
});

const enforceChallengeAfterPrimaryAuth = createAuthMiddleware(async (ctx) => {
  const issued = ctx.context.newSession;
  if (!issued) return;

  const input: IssuedSession = {
    userId: issued.user.id,
    sessionToken: issued.session.token,
    route: { path: ctx.path, params: ctx.params },
    location: ctx.context.responseHeaders?.get("location"),
    setCookie: (cookie) => ctx.setCookie(cookie.name, cookie.value, cookie.attributes),
    dropIssuedSession: () => {
      deleteSessionCookie(ctx, true);
      ctx.context.setNewSession(null);
    },
  };

  // runtime の動的 import と try/catch の位置づけは ADR-0017「実装の機構」
  let decision: "pass" | "challenge";
  try {
    const { getRuntime } = await import("../runtime");
    decision = await getRuntime().runPromise(enforceChallenge(input));
  } catch (error) {
    console.error("[mfa-challenge] runtime unavailable", error);
    if (!isMfaChallengeEnabled(process.env.MFA_CHALLENGE_ENABLED)) return;
    input.dropIssuedSession();
    decision = "challenge";
  }
  if (decision === "challenge") {
    throw ctx.redirect(new URL(MFA_CHALLENGE_PAGE, ctx.context.baseURL).toString());
  }
});

export const mfaChallenge = (): BetterAuthPlugin => ({
  id: "mfa-challenge",
  hooks: {
    after: [
      {
        matcher: (ctx) => isPrimaryAuthRoute(ctx.path),
        handler: enforceChallengeAfterPrimaryAuth,
      },
    ],
  },
});
