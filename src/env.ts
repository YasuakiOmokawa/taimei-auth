export const isLocalEnvironment = (): boolean => process.env.APP_ENV !== "production";

export const isBunRuntime = (): boolean => typeof Bun !== "undefined";

export const getTrustedOrigins = (): string[] =>
  (process.env.AUTH_TRUSTED_ORIGINS || "").split(",").filter(Boolean);
