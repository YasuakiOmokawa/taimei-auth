import { buildAuthLoginUrl } from "@taimei-code/auth-client";
import { getSessionCookie } from "better-auth/cookies";
import { Effect } from "effect";
import { Hono } from "hono";
import type { Context } from "hono";

import { AuthApi } from "../auth-service";
import { captureCause } from "../sentry";
import { runRoute } from "./run-route";

// 未知のクエリは破棄し、allowlist 経由のみ /auth/ に渡す (パラメータ汚染防止)
const PASSTHROUGH_QUERY_KEYS = ["error"] as const;

// ログイン URL の組み立ては SDK の buildAuthLoginUrl に委ねる (キー名 / 順序を consumer と 1 箇所に集約)。
const buildLoginRedirect = (url: URL): URL => {
  const target = new URL(
    buildAuthLoginUrl({
      authBaseUrl: url.origin,
      service: "accounts",
      returnTo: `${url.origin}/account`,
    }),
  );

  for (const key of PASSTHROUGH_QUERY_KEYS) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      target.searchParams.set(key, value);
    }
  }

  return target;
};

// Redis transient 失敗は 5xx にせず未認証扱いで共通ログイン画面に流す (fail-open)。Sentry warning で観測のみ。
const failOpenAsSignedOut = (failure: { readonly cause: unknown }) =>
  captureCause({ tags: { handler: "loginShortcut" } })(failure).pipe(Effect.as(false));

export const loginShortcutProgram = Effect.fn("handlers.loginShortcut")(function* (c: Context) {
  const headers = c.req.raw.headers;
  // `/` は最も hot な entry。Cookie 不在なら Redis/DB を叩かず未認証確定で latency を削る。
  const authenticated = getSessionCookie(headers)
    ? yield* AuthApi.use((authApi) => authApi.getSession(headers)).pipe(
        Effect.map((session) => session !== null),
        Effect.catchTag("AuthApiError", failOpenAsSignedOut),
      )
    : false;

  // 302 Location が Cookie で分岐するため CDN/proxy の共有 cache を禁止 (session-leak 防止)
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Cookie");

  const url = new URL(c.req.url);
  return c.redirect(
    authenticated ? `${url.origin}/account` : buildLoginRedirect(url).toString(),
    302,
  );
});

const handler = (c: Context) => runRoute(c, loginShortcutProgram(c));

export const loginShortcut = new Hono().get("/", handler).get("/login", handler);
