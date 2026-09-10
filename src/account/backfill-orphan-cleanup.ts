import { Effect } from "effect";
import { InvitationRepo } from "../invitation/ports";
import { MembershipRepo } from "../membership/ports";
import { Transaction } from "../transaction";
import { deleteAccountIfOrphaned } from "./orphan";
import { UserRepo } from "./ports";

type BackfillReport = {
  executed: boolean;
  companyCount: number;
  membershipsRemoved: number;
  accountsDeleted: number;
  deletedUserIds: string[];
};

type GhostMembershipPurge = { ghostMembershipCount: number; orphanUserIds: string[] };

// ADR-0010 PR-4: D1 導入前に soft delete された company に残る ghost membership と orphan アカウントを
// 掃除する one-shot backfill。rollback 不能なため dry-run で対象を確認してから execute=true で実行する。
export const backfillOrphanCleanup = Effect.fn("account.backfillOrphanCleanup")(function* (opts: {
  execute: boolean;
}) {
  const companyIds = yield* MembershipRepo.use((memberships) =>
    memberships.findDeletedCompanyIdsWithMemberships(),
  );
  const purges = yield* Effect.forEach(companyIds, (companyId) =>
    opts.execute ? purgeGhostMemberships(companyId) : previewGhostMembershipPurge(companyId),
  );
  const deletedUserIds = [...new Set(purges.flatMap((purge) => purge.orphanUserIds))];

  return {
    executed: opts.execute,
    companyCount: companyIds.length,
    membershipsRemoved: purges.reduce((n, purge) => n + purge.ghostMembershipCount, 0),
    accountsDeleted: deletedUserIds.length,
    deletedUserIds,
  } satisfies BackfillReport;
});

const previewGhostMembershipPurge = Effect.fn("account.previewGhostMembershipPurge")(function* (
  companyId: string,
) {
  const memberships = yield* MembershipRepo;
  const members = yield* memberships.findMembersByCompanyId(companyId);
  const orphans = yield* Effect.filter(members, (m) =>
    Effect.map(memberships.countActiveMembershipsByUserId(m.userId), (n) => n === 0),
  );
  return {
    ghostMembershipCount: members.length,
    orphanUserIds: orphans.map((m) => m.userId),
  } satisfies GhostMembershipPurge;
});

// DeleteCompany と同じ順 (invitation 失効 → membership 削除 → last_used 付け替え → orphan 削除) を守る。
const purgeGhostMemberships = Effect.fn("account.purgeGhostMemberships")(function* (
  companyId: string,
) {
  const memberships = yield* MembershipRepo;
  const invitations = yield* InvitationRepo;
  const users = yield* UserRepo;
  const tx = yield* Transaction;

  return yield* tx.run(
    Effect.fn("account.purgeGhostMemberships.apply")(function* (t) {
      yield* invitations.revokePendingInvitationsOfCompany(companyId, t);
      const removed = yield* memberships.removeMembershipsOfCompany(companyId, t);
      yield* users.reassignLastUsedCompanyForDeletedCompany(companyId, t);
      const orphanUserIds = yield* Effect.filter(
        [...new Set(removed.map((m) => m.userId))],
        (userId) => deleteAccountIfOrphaned(userId, t),
      );
      return { ghostMembershipCount: removed.length, orphanUserIds } satisfies GhostMembershipPurge;
    }),
  );
});
