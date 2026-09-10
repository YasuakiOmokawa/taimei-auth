import { MfaChallengeView } from "../MfaChallengeView";
import { useMfaChallengeFlow } from "../use-mfa-challenge-flow";

export const MfaChallenge = () => <MfaChallengeView {...useMfaChallengeFlow()} />;
