import { useEffect, useReducer, useRef } from "react";
import {
  initialMfaChallengeFlowState,
  reduceMfaChallengeFlow,
  resolveMfaChallengeVerification,
  type MfaChallengeFlowState,
  type MfaChallengePort,
} from "./mfa-challenge-flow";
import { getMfaChallenge, mfaErrorCodeOf, verifyMfaChallenge, type MfaErrorCode } from "./mfa-api";
import { useMfaCodeInput, type MfaCodeInput } from "./use-mfa-code-entry";

type MfaChallengeCodeInput = Parameters<typeof verifyMfaChallenge>[0];

type ChallengePort = MfaChallengePort<MfaChallengeCodeInput, MfaErrorCode>;

export const mfaChallengePort: ChallengePort = {
  observe: async (signal) => {
    try {
      const { pending } = await getMfaChallenge(signal);
      return pending ? { kind: "present" } : { kind: "absent" };
    } catch (error) {
      if (signal.aborted) throw error;
      // 通信失敗も形の崩れた 2xx も、チャレンジの不存在を推測せず入力を許す側へ倒す。
      return { kind: "unavailable" };
    }
  },
  verify: async (input) => {
    try {
      const { redirectUrl } = await verifyMfaChallenge(input);
      return { kind: "passed", redirectUrl };
    } catch (error) {
      return { kind: "rejected", errorCode: mfaErrorCodeOf(error) };
    }
  },
};

type MfaChallengeViewKind = "observing" | "redirecting" | "expired" | "entry";

export type MfaChallengeFlow = {
  view: MfaChallengeViewKind;
  entry: MfaCodeInput;
};

const viewOf = (state: MfaChallengeFlowState<MfaErrorCode>): MfaChallengeViewKind =>
  state.phase === "ready" || state.phase === "verifying" ? "entry" : state.phase;

// port は useEffect の依存: render ごとに新しい object を渡すと観測 GET の abort → 再実行が繰り返される。
export function useMfaChallengeFlow(port: ChallengePort = mfaChallengePort): MfaChallengeFlow {
  const [state, dispatch] = useReducer(
    reduceMfaChallengeFlow<MfaErrorCode>,
    initialMfaChallengeFlowState,
  );
  const readController = useRef<AbortController | null>(null);
  const verificationInFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    readController.current = controller;

    void port
      .observe(controller.signal)
      .then((observation) => {
        if (!controller.signal.aborted) {
          dispatch({ type: "observation_resolved", observation });
        }
      })
      // 想定外の reject でも observing で固まらせず、入力を許す unavailable へ倒す。
      .catch(() => {
        if (!controller.signal.aborted) {
          dispatch({
            type: "observation_resolved",
            observation: { kind: "unavailable" },
          });
        }
      });

    return () => {
      controller.abort();
      readController.current = null;
    };
  }, [port]);

  const submit = (input: MfaChallengeCodeInput) => {
    const controller = readController.current;
    if (
      state.phase !== "ready" ||
      verificationInFlight.current ||
      !controller ||
      controller.signal.aborted
    ) {
      return;
    }

    verificationInFlight.current = true;
    dispatch({ type: "verification_started" });
    void resolveMfaChallengeVerification(port, input, controller.signal)
      .then((verification) => {
        if (!controller.signal.aborted) {
          dispatch({ type: "verification_resolved", verification });
        }
      })
      // "unknown" 固定にしないと terminal な challenge_expired が ready に載り、生きた入力欄と並ぶ。
      .catch(() => {
        if (!controller.signal.aborted) {
          dispatch({
            type: "verification_resolved",
            verification: { kind: "rejected", errorCode: "unknown" },
          });
        }
      })
      .finally(() => {
        verificationInFlight.current = false;
      });
  };

  const entry = useMfaCodeInput({
    inputId: "mfa-challenge-code",
    submitting: state.phase === "verifying",
    // expired へ移った直後に直前の失敗文言が残ると、打ち直せば通るように読めるため出さない。
    errorCode: state.phase === "ready" ? state.errorCode : null,
    submit,
    onKindChange: () => dispatch({ type: "error_cleared" }),
  });

  const redirectUrl = state.phase === "redirecting" ? state.redirectUrl : null;
  useEffect(() => {
    if (redirectUrl !== null) {
      // redirect 先の検証は auth ホストの出口が持つ (client 側で再検証しない)。
      window.location.assign(redirectUrl);
    }
  }, [redirectUrl]);

  return { view: viewOf(state), entry };
}
