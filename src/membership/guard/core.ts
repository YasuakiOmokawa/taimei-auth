import { Effect } from "effect";
import type { Role } from "@/db/repositories/membership";
import { UserRepo } from "../../account/ports";
import { AuthApi } from "../../auth-service";
import { captureCause } from "../../sentry";
import { isAtLeast } from "../policy";
import { MembershipRepo } from "../ports";
import { Forbidden, type InvalidArgument, NotFound, Unauthorized } from "./errors";

// 列は「hot path の再 SELECT を消す」目的でのみ足す (requireActor が毎 request user 行を読むため)。
// 表示用途 (name / image) では足さない。
export type Actor = {
  id: string;
  email: string;
  lastUsedCompanyId: string | null;
};

export type ParseBody<T> = Effect.Effect<T, InvalidArgument>;

const failClosedAsUnauthorized = (failure: { readonly cause: unknown }) =>
  captureCause({ tags: { component: "membership-guard" } })(failure).pipe(
    Effect.andThen(new Unauthorized()),
  );

// session 解決は fail-closed: better-auth / user 行読み取りの失敗 (AuthApiError / DbError) は Sentry に
// 残したうえで Unauthorized に倒す。障害と未認証が同じ 401 になるため、障害側だけ Sentry に記録する。
// better-auth cookieCache (最大 5 分) は user 行削除後も session を返すため、DB の user 存在で fail-closed
// にする (削除済み user を通すと membership insert が FK 違反 500 になる)。
export const requireActor = Effect.fn("membership.requireActor")(
  function* (headers: Headers) {
    const session = yield* AuthApi.use((authApi) => authApi.getSession(headers));
    if (!session?.user?.id) return yield* new Unauthorized();
    const dbUser = yield* UserRepo.use((users) => users.findUserById(session.user.id));
    if (!dbUser) return yield* new Unauthorized();
    return {
      id: dbUser.id,
      email: dbUser.email,
      lastUsedCompanyId: dbUser.lastUsedCompanyId,
    } satisfies Actor;
  },
  Effect.catchTag(["AuthApiError", "DbError"], failClosedAsUnauthorized),
);

// membership の読み取り失敗 (DbError) は捕捉せず伝播させ 500 にする (fail-closed の対象は session 解決のみ)。
// identity DB の RPC 化時に auth 断→401 / membership 断→500 の非対称を再判断する。
// 401→400→403 の順序を保つ route が requireActor と別に呼ぶ (401 と 403 の間に body parse 400 を挟む)。
export const requireMembershipOf = Effect.fn("membership.requireMembershipOf")(function* (
  actor: Actor,
  companyId: string,
  minRole?: Role,
) {
  const membership = yield* MembershipRepo.use((repo) => repo.findMembership(actor.id, companyId));
  if (!membership) return yield* new Forbidden();
  // 未知 role は fail-closed で 403 に倒す (isAtLeast が own-property 判定で未知 role を false に落とす)。
  if (minRole && !isAtLeast(membership.role, minRole)) return yield* new Forbidden();
  return membership.role;
});

export const requireMembership = Effect.fn("membership.requireMembership")(function* (
  headers: Headers,
  companyId: string,
  minRole?: Role,
) {
  const actor = yield* requireActor(headers);
  const role = yield* requireMembershipOf(actor, companyId, minRole);
  return { actor, role };
});

// operation 単位 entry が共有する target 側の解決 (null → 404)。
export const requireTargetMembership = Effect.fn("membership.requireTargetMembership")(function* (
  userId: string,
  companyId: string,
) {
  const membership = yield* MembershipRepo.use((repo) => repo.findMembership(userId, companyId));
  if (!membership) return yield* new NotFound();
  return membership;
});
