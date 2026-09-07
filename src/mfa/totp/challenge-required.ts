import { Effect } from "effect";
import { requiresMfaChallenge } from "../policy";
import { MfaTotpRepo } from "./ports";

// ログイン境界の +1 SELECT の唯一の読み口 (D5)。PK 引き 1 行・secret 列に触れない射影に限る。
// 発火点は一次認証成功後の after-hook のみで、リクエスト毎ではない。
export const mfaChallengeRequired = Effect.fn("mfa.challengeRequired")(function* (userId: string) {
  const mfa = yield* MfaTotpRepo;
  return requiresMfaChallenge(yield* mfa.readMfaVerification(userId));
});
