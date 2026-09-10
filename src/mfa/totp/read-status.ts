import { Effect } from "effect";
import { requiresMfaChallenge } from "../policy";
import type { MfaTotpActor } from "./contracts";
import { MfaTotpRepo } from "./ports";

export const readOwnedMfaStatus = Effect.fn("mfa.readOwnedMfaStatus")(function* (
  actor: MfaTotpActor,
) {
  const mfa = yield* MfaTotpRepo;
  const row = yield* mfa.readMfaStatusRow(actor.id);
  const enabled = requiresMfaChallenge(row);
  return {
    enabled,
    recoveryCodesRemaining: enabled && row ? row.unusedRecoveryCodes : 0,
  };
});
