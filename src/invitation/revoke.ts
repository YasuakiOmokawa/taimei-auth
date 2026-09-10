import { Effect } from "effect";
import type { DbTx } from "@/db/transaction";
import { AuditLog } from "../audit/ports";
import { Transaction } from "../transaction";
import { NotFoundOrNotPending } from "./errors";
import { InvitationRepo } from "./ports";

export const revokeInvitation = Effect.fn("invitation.revoke")(function* (params: {
  actorUserId: string;
  companyId: string;
  invitationId: string;
}) {
  const { actorUserId, companyId, invitationId } = params;
  const invitations = yield* InvitationRepo;
  const audit = yield* AuditLog;
  const tx = yield* Transaction;

  yield* tx.run(
    Effect.fn("invitation.revoke.apply")(function* (t: DbTx) {
      const row = yield* invitations.markInvitationRevoked(invitationId, companyId, t);
      if (!row) return yield* new NotFoundOrNotPending();
      yield* audit.recordInvitationRevoked(
        { actor_user_id: actorUserId, invitation_id: row.id, company_id: companyId },
        t,
      );
    }),
  );
});
