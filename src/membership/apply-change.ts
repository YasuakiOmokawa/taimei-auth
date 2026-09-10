import { Effect } from "effect";
import type { Role } from "@/db/repositories/membership";
import type { DbTx } from "@/db/transaction";
import type { DbError } from "../errors";
import { LastOwner } from "./errors";
import { MembershipRepo } from "./ports";

// tx 外の role 読みで「OWNER が減るか」を判定すると並行 transfer で OWNER 0 になるため常に lock する。
const keepingAnOwner = Effect.fn("membership.keepingAnOwner")(function* <A>(
  tx: DbTx,
  companyId: string,
  write: (repo: MembershipRepo["Service"]) => Effect.Effect<A, DbError>,
) {
  const repo = yield* MembershipRepo;
  yield* repo.lockOwnerMembershipsOfCompany(tx, companyId);
  const written = yield* write(repo);
  if ((yield* repo.countOwnerMemberships(tx, companyId)) < 1) return yield* new LastOwner();
  return written;
});

export const applyRoleChange = (
  tx: DbTx,
  change: { targetUserId: string; companyId: string; nextRole: Role },
) =>
  keepingAnOwner(tx, change.companyId, (repo) =>
    repo.updateMembershipRole(change.targetUserId, change.companyId, change.nextRole, tx),
  );

export const applyRemoval = (tx: DbTx, change: { targetUserId: string; companyId: string }) =>
  keepingAnOwner(tx, change.companyId, (repo) =>
    repo.deleteMembership(change.targetUserId, change.companyId, tx),
  );

export const applyTransfer = (
  tx: DbTx,
  change: { actorUserId: string; toUserId: string; companyId: string },
) =>
  keepingAnOwner(tx, change.companyId, (repo) =>
    Effect.andThen(
      repo.updateMembershipRole(change.toUserId, change.companyId, "OWNER", tx),
      repo.updateMembershipRole(change.actorUserId, change.companyId, "ADMIN", tx),
    ),
  );
