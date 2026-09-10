import { acceptInvitationPath } from "@core/invitation/accept-path";
import { signInParamsObjectSchema } from "@core/sign-in-params";

// 相互リンクで error=signin_failed 等の stale な param を持ち込ませないための allowlist
const ALLOWLIST = Object.keys(signInParamsObjectSchema.shape);

export const buildSignParams = (searchParams: URLSearchParams): string => {
  const out = new URLSearchParams();
  for (const key of ALLOWLIST) {
    const value = searchParams.get(key);
    if (value !== null) out.set(key, value);
  }
  return out.toString();
};

// redirect_url へ直行すると membership が作られないまま signup/company へ流れ招待受諾から脱落する
export const invitationAcceptCallbackUrl = (invitationToken: string): string =>
  `${window.location.origin}${acceptInvitationPath(invitationToken)}`;
