import { getSessionCookie } from "better-auth/cookies";
import { Effect } from "effect";
import type { Context, MiddlewareHandler } from "hono";
import { spendAttemptBudget } from "./attempt-budget";
import { runMiddleware } from "./handlers/run-route";
import { JSON_HEADERS } from "./handlers/wire-error";

export type RateLimitOptions = {
  keyFn: (c: Context) => string | Promise<string>;
  limit: number;
  windowSec: number;
};

export const magicLinkKey = (axis: "ip" | "email", id: string): string =>
  `rate-limit:magic-link:${axis}:${id}`;

// MFA 状態変更を数える軸。セッションあり経路にプラグインの試行制限が継承されないため誤コード連投の歯止めは
// ここだけ。軸を IP でなくセッションに取るのは cookie を盗んだ攻撃者が IP を変えても同じ枠に載せるため。
// token をそのままキー名にしないのは、キー名が Redis 上に残る有効な認証情報になってしまうから。
export async function mfaAttemptKey(headers: Headers, fallbackIp: string): Promise<string> {
  const sessionToken = getSessionCookie(headers);
  if (!sessionToken) return `rate-limit:mfa-attempt:ip:${fallbackIp}`;
  return `rate-limit:mfa-attempt:session:${await sha256Hex(sessionToken)}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// fail-open。Retry-After = windowSec (INCR ごとに EXPIRE するので残り TTL は常に windowSec): CONTEXT.md「試行枠」
type RateLimitInput = Omit<RateLimitOptions, "keyFn"> & { key: string };

export const rateLimitProgram = Effect.fn("rateLimit.check")(function* (input: RateLimitInput) {
  const verdict = yield* spendAttemptBudget({
    key: input.key,
    windowSeconds: input.windowSec,
    maxAttempts: input.limit,
    component: "rate-limit",
  });
  if (verdict !== "exhausted") return undefined;
  return new Response(JSON.stringify({ error: "Too Many Requests" }), {
    status: 429,
    headers: { ...JSON_HEADERS, "Retry-After": String(input.windowSec) },
  });
});

export function createRateLimitMiddleware(options: RateLimitOptions): MiddlewareHandler {
  return (c, next) =>
    runMiddleware(
      c,
      next,
      Effect.promise(async () => options.keyFn(c)).pipe(
        Effect.flatMap((key) =>
          rateLimitProgram({ key, limit: options.limit, windowSec: options.windowSec }),
        ),
      ),
    );
}
