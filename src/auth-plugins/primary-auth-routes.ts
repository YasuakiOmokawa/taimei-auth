import type { ChallengeMethod } from "../mfa/totp/login-challenge";

// better-auth の hook が受け取る `ctx.path` は route パターンで実 path ではない ("/callback/:id")。
export const MAGIC_LINK_VERIFY_ROUTE = "/magic-link/verify";
export const OAUTH_CALLBACK_ROUTE = "/callback/:id";

export const PRIMARY_AUTH_ROUTES = [MAGIC_LINK_VERIFY_ROUTE, OAUTH_CALLBACK_ROUTE] as const;

export type AuthRouteMatch = {
  path: string | undefined;
  params: Record<string, string> | undefined;
};

export function isPrimaryAuthRoute(path: string | undefined): boolean {
  return PRIMARY_AUTH_ROUTES.some((route) => route === path);
}

// 未知の provider を既定値に寄せると、誤った method の sign_in audit が黙って積まれる。
export function resolvePrimaryAuthMethod(route: AuthRouteMatch): ChallengeMethod | undefined {
  if (route.path === MAGIC_LINK_VERIFY_ROUTE) return "magic_link";
  if (route.path !== OAUTH_CALLBACK_ROUTE) return undefined;
  return route.params?.id === "github" ? "github" : undefined;
}
