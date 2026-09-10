import { Effect } from "effect";
import type { DbTx } from "@/db/transaction";
import { AuthApi } from "../auth-service";
import { SessionRepo } from "./ports";

export const revokeUserSessions = Effect.fn("account.revokeUserSessions")(function* (
  userId: string,
  tx: DbTx,
) {
  const sessions = yield* SessionRepo;
  const authApi = yield* AuthApi;
  yield* sessions.revokeAllSessionsForUser(userId, tx);
  yield* authApi.deleteUserSessions(userId);
});
