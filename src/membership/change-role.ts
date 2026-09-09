import { Effect } from "effect";
import type { Role } from "@/db/repositories/membership";
import type { DbTx } from "@/db/transaction";
import { AuditLog } from "../audit/ports";
import { Transaction } from "../transaction";
import { applyRoleChange } from "./apply-change";
import { NotFound } from "./guard/errors";

export const changeRole = Effect.fn("membership.changeRole")(function* (params: {
  actorUserId: string;
  targetUserId: string;
  companyId: string;
  beforeRole: Role;
  nextRole: Role;
}) {
  const { actorUserId, targetUserId, companyId, beforeRole, nextRole } = params;

  // no-op 短絡: tx open / audit を発火しない (tx 数 metric の silent 増を防ぐ)。
  if (beforeRole === nextRole) return;

  const audit = yield* AuditLog;
  const tx = yield* Transaction;

  yield* tx.run(
    Effect.fn("membership.changeRole.apply")(function* (t: DbTx) {
      const updated = yield* applyRoleChange(t, { targetUserId, companyId, nextRole });
      if (!updated) return yield* new NotFound();
      yield* audit.recordRoleChanged(
        {
          actor_user_id: actorUserId,
          company_id: companyId,
          target_user_id: targetUserId,
          before_role: beforeRole,
          after_role: nextRole,
        },
        t,
      );
    }),
  );
});
