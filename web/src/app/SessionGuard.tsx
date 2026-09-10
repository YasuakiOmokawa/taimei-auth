import { useEffect, type ReactNode } from "react";

import { useCurrentCompany } from "../account/current-company";
import { redirectToCompanySignup, redirectToSignIn } from "../auth/auth-redirect";
import { FullScreenLoader } from "../shared/FullScreenLoader";

// 認証判定は CurrentCompanyProvider の memberships fetch に相乗りする (401 = 未認証)
export const SessionGuard = ({ children }: { children: ReactNode }) => {
  const { loading, unauthorized, loadFailed, memberships } = useCurrentCompany();
  const needsCompanySignup = !loadFailed && memberships.length === 0;

  useEffect(() => {
    if (loading) return;
    if (unauthorized) {
      redirectToSignIn();
      return;
    }
    if (needsCompanySignup) {
      redirectToCompanySignup();
    }
  }, [loading, unauthorized, needsCompanySignup]);

  // redirect 発火後も unmount まで loader を出し続ける (children の一瞬の描画を防ぐ)。
  if (loading || unauthorized || needsCompanySignup) {
    return <FullScreenLoader />;
  }

  return <>{children}</>;
};
