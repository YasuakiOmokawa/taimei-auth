// 相対 import なのは web 側の "@/" alias と誤解決するため。
import type { Role } from "../../db/repositories/membership";

export const ROLE_LABELS_JA: Record<Role, string> = {
  OWNER: "オーナー",
  ADMIN: "管理者",
  MEMBER: "メンバー",
};

export const roleLabelJa = (role: string, unknownFallback: string = role): string =>
  Object.hasOwn(ROLE_LABELS_JA, role) ? ROLE_LABELS_JA[role as Role] : unknownFallback;
