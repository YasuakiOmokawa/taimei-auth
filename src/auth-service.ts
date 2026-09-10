import type { Effect } from "effect";
import { Context, Layer } from "effect";
import { auth, type Session } from "./auth";
import { type AuthApiError, tryAuthApi } from "./errors";

export class AuthApi extends Context.Service<
  AuthApi,
  {
    getSession(headers: Headers): Effect.Effect<Session | null, AuthApiError>;
    // secondaryStorage (Redis) 側の session 実体を全部消す (DB の revoked_at 記帳と対で使う)。
    deleteUserSessions(userId: string): Effect.Effect<void, AuthApiError>;
    // 一次認証で立った session 実体 1 つを消す (MFA チャレンジ介入。cookie は hook 側が先に落とす)。
    deleteSession(token: string): Effect.Effect<void, AuthApiError>;
    // magic link の発行と送信 (better-auth の magicLink plugin 経由。送信自体は plugin の sendMagicLink callback)。
    signInMagicLink(input: {
      email: string;
      callbackURL: string;
    }): Effect.Effect<void, AuthApiError>;
    // cookieCache (Redis) と DB session を一括 invalidate する。
    signOut(headers: Headers): Effect.Effect<void, AuthApiError>;
  }
>()("taimei/AuthApi") {}

export const AuthApiLive = Layer.succeed(
  AuthApi,
  AuthApi.of({
    getSession: (headers) => tryAuthApi(() => auth.api.getSession({ headers })),
    deleteUserSessions: (userId) =>
      tryAuthApi(async () => {
        const ctx = await auth.$context;
        await ctx.internalAdapter.deleteUserSessions(userId);
      }),
    deleteSession: (token) =>
      tryAuthApi(async () => {
        const ctx = await auth.$context;
        await ctx.internalAdapter.deleteSession(token);
      }),
    signInMagicLink: ({ email, callbackURL }) =>
      tryAuthApi(async () => {
        await auth.api.signInMagicLink({ body: { email, callbackURL }, headers: new Headers() });
      }),
    signOut: (headers) =>
      tryAuthApi(async () => {
        await auth.api.signOut({ headers });
      }),
  }),
);
