// 相対 import なのは web の "@/" alias との誤解決を避けるため。
import type { Role } from "../../db/repositories/membership";

export type { Role } from "../../db/repositories/membership";

// export しないのは index / prototype lookup が未知 role を素通しさせるため。Object.hasOwn 必須 (PR #103)。
const ROLE_LEVEL = { MEMBER: 0, ADMIN: 1, OWNER: 2 } as const;

export function isAtLeast(role: string, minRole: Role): boolean {
  if (!Object.hasOwn(ROLE_LEVEL, role)) return false;
  return ROLE_LEVEL[role as Role] >= ROLE_LEVEL[minRole];
}

export function isKnownRole(role: string): role is Role {
  return Object.hasOwn(ROLE_LEVEL, role);
}

// 未知 role も保護対象に含めて OWNER 保護の fail-open を防ぐ (server 述語と web の出し分けが共有)。
export function requiresOwnerProtection(role: string): boolean {
  return !isKnownRole(role) || role === "OWNER";
}

export function canChangeRole(actorRole: Role, beforeRole: Role, nextRole: Role): boolean {
  const touchesOwner = requiresOwnerProtection(beforeRole) || nextRole === "OWNER";
  return touchesOwner ? actorRole === "OWNER" : true;
}

// ADMIN が invitation 経由で OWNER を mint する迂回路を塞ぐ (Issue #104)。
export function canInviteRole(actorRole: Role, invitedRole: Role): boolean {
  return invitedRole === "OWNER" ? actorRole === "OWNER" : true;
}

export function canAttemptRemoval(actorRole: Role, isSelf: boolean): boolean {
  return isSelf || isAtLeast(actorRole, "ADMIN");
}

export function canRemoveTarget(actorRole: Role, isSelf: boolean, targetRole: Role): boolean {
  return !(requiresOwnerProtection(targetRole) && !isSelf && actorRole !== "OWNER");
}

// OWNER 招待だけ招待者の現役 OWNER を要求するのは、降格 / 除名後の mint を塞ぐため。
export function canAcceptInvitedRole(
  invitedRole: string,
  inviterCurrentRole: string | null,
): boolean {
  if (!isKnownRole(invitedRole)) return false;
  if (invitedRole !== "OWNER") return true;
  return inviterCurrentRole === "OWNER";
}
