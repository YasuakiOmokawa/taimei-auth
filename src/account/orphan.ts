import { Effect } from "effect";
import type { DbTx } from "@/db/transaction";
import { MembershipRepo } from "../membership/ports";
import { deleteAccount } from "./delete-account";

export const deleteAccountIfOrphaned = Effect.fn("account.deleteAccountIfOrphaned")(function* (
  userId: string,
  tx: DbTx,
) {
  const memberships = yield* MembershipRepo;
  if ((yield* memberships.countActiveMembershipsByUserId(userId, tx)) > 0) return false;
  yield* deleteAccount(userId, tx);
  return true;
});
