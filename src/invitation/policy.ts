import type { InvitationRow } from "@/db/repositories/invitation";

export const isAcceptableAt = (row: InvitationRow, nowMillis: number): boolean =>
  row.status === "PENDING" && row.expiresAt.getTime() > nowMillis;
