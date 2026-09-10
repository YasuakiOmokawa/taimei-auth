export type CrossSubDomainCookies = {
  enabled: boolean;
  domain: string;
};

export const resolveCrossSubDomainCookies = (
  authCookieDomain: string | undefined,
): CrossSubDomainCookies => ({
  enabled: !!authCookieDomain && authCookieDomain !== "localhost",
  domain: authCookieDomain || "taimei-code.com",
});
