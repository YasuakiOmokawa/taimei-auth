import type { Effect } from "effect";
import { Context, Layer } from "effect";
import { auth, type Session } from "./auth";
import { type AuthApiError, tryAuthApi } from "./errors";

export class AuthApi extends Context.Service<
  AuthApi,
  {
    getSession(headers: Headers): Effect.Effect<Session | null, AuthApiError>;
    deleteUserSessions(userId: string): Effect.Effect<void, AuthApiError>;
    deleteSession(token: string): Effect.Effect<void, AuthApiError>;
    signInMagicLink(input: {
      email: string;
      callbackURL: string;
    }): Effect.Effect<void, AuthApiError>;
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
