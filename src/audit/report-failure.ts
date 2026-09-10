import { Effect } from "effect";
import type { AuditLogEntry } from "@/db/repositories/audit-log";
import type { DbError } from "../errors";
import { SentryService } from "../sentry";
import { AuditLog } from "./ports";

export const swallowAuditFailure =
  (event: AuditLogEntry["eventType"]) =>
  <A, R>(
    program: Effect.Effect<A, DbError, R>,
  ): Effect.Effect<A | undefined, never, R | SentryService> =>
    program.pipe(
      Effect.catch((failure) =>
        Effect.gen(function* () {
          const sentry = yield* SentryService;
          yield* sentry.captureException(failure.cause, {
            tags: { component: "audit-log", event },
          });
          return undefined;
        }),
      ),
    );

export const appendAuditLogBestEffort = (entry: AuditLogEntry) =>
  AuditLog.use((audit) => audit.appendAuditLog(entry)).pipe(swallowAuditFailure(entry.eventType));
