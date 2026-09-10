import { Effect } from "effect";
import type { DbTx } from "@/db/transaction";
import { AuditLog } from "../audit/ports";
import { UserRepo } from "./ports";
import { revokeUserSessions } from "./revoke-sessions";

// audit を先に置くのは tx 失敗時に audit だけ残さないため (audit_log.user_id は FK なし)。
export const deleteAccount = Effect.fn("account.deleteAccount")(function* (
  userId: string,
  tx: DbTx,
) {
  const audit = yield* AuditLog;
  const users = yield* UserRepo;
  yield* audit.recordAccountDeleted({ user_id: userId }, tx);
  yield* revokeUserSessions(userId, tx);
  return yield* users.deleteUser(userId, tx);
});
