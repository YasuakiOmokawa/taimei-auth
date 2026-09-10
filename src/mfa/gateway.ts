import { makeSignature } from "better-auth/crypto";
import { Clock, Effect, Predicate } from "effect";
import { serialize as serializeSetCookie } from "hono/utils/cookie";
import { auth } from "../auth";
import { type AuthApiError, tryAuthApi } from "../errors";
import { captureCause } from "../sentry";
import { ChallengeExpired } from "./error-mapping";

// 呼び出しは headers だけを渡す (request を渡すと originCheck と同じ discriminator を自分で踏む)。

// better-auth の isAPIError は body.code 無しの APIError も真にするため、写像対象を code 付きに限る。
const hasApiErrorCode = (failure: AuthApiError) =>
  Predicate.isObject(failure.cause) &&
  Predicate.isObject(failure.cause.body) &&
  Predicate.isString(failure.cause.body.code);

export const revokeOtherSessions = Effect.fn("mfa.revokeOtherSessions")(
  function* (headers: Headers) {
    return yield* tryAuthApi(() =>
      auth.api
        .revokeOtherSessions({ headers, returnHeaders: true })
        .then(({ headers: revoked }) => revoked ?? new Headers()),
    );
  },
  Effect.catchIf(hasApiErrorCode, (failure) =>
    captureCause({ tags: { component: "mfa-gateway" } })(failure).pipe(
      Effect.andThen(new ChallengeExpired()),
    ),
  ),
);

// better-call の signCookieValue と同形 (percent-encode 済み)。形式と属性は session-cookie-contract.test.ts が固定

// 第二要素の検証成功後にのみ呼ぶ (ADR-0016)。Max-Age 明示は browser-session cookie 化で寿命が揺れるのを防ぐ
export const issueSessionFor = Effect.fn("mfa.issueSessionFor")(function* (userId: string) {
  const now = yield* Clock.currentTimeMillis;
  return yield* tryAuthApi(async () => {
    const authContext = await auth.$context;
    const session = await authContext.internalAdapter.createSession(userId);
    const maxAge = Math.floor((new Date(session.expiresAt).getTime() - now) / 1000);
    const cookie = authContext.createAuthCookie("session_token", { maxAge });
    const signed = `${session.token}.${await makeSignature(session.token, authContext.secret)}`;
    const headers = new Headers();
    headers.append("set-cookie", serializeSetCookie(cookie.name, signed, cookie.attributes));
    return headers;
  });
});
