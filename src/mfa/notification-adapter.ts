import { Effect } from "effect";
import { Background } from "../background";
import { EmailSender } from "../email/ports";

export const notifyMfaEnabled = (
  email: string,
): Effect.Effect<void, never, EmailSender | Background> =>
  notifyInBackground((sender) => sender.sendMfaEnabled(email));

export const notifyMfaDisabled = (
  email: string,
): Effect.Effect<void, never, EmailSender | Background> =>
  notifyInBackground((sender) => sender.sendMfaDisabled(email));

export const notifyMfaDisabledForManagement = Effect.fn("mfa.notifyMfaDisabledForManagement")(
  function* (email: string) {
    const sender = yield* EmailSender;
    return yield* sender.sendMfaDisabled(email).pipe(
      Effect.map(() => true),
      Effect.catch((error) =>
        Effect.gen(function* () {
          yield* Effect.logError("failed to send MFA disabled notification email", error.cause);
          return false;
        }),
      ),
    );
  },
);

const notifyInBackground = (
  send: (sender: EmailSender["Service"]) => Effect.Effect<void, { readonly cause: unknown }>,
): Effect.Effect<void, never, EmailSender | Background> =>
  Effect.gen(function* () {
    const sender = yield* EmailSender;
    const background = yield* Background;
    yield* background.run(
      send(sender).pipe(
        Effect.catch((error) =>
          Effect.logError("failed to send MFA notification email", error.cause),
        ),
      ),
    );
  });
