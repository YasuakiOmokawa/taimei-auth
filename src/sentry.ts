import { Context, Effect, Layer } from "effect";
// runtime 非依存の Sentry facade。実 backend は各 entry が setSentryBackend で注入する。本 module に
// SDK 依存を持たせないことで Workers バンドルへの @sentry/bun 混入を防ぐ (詳細: ADR-0011)。
export type CaptureContext = {
  level?: "fatal" | "error" | "warning" | "info" | "debug";
  tags?: Record<string, string | undefined>;
  extra?: Record<string, unknown>;
};

export interface SentryBackend {
  captureException(error: unknown, context?: CaptureContext): void;
  captureMessage(message: string, context?: CaptureContext): void;
}

// backend 未注入時 (SENTRY_DSN 無し / Workers 未配線) の console fallback。test の restore もこれを渡す
// (backend は module-global のため、spy を install した file は既定へ戻さないと後続 file へ漏れる)。
export const consoleSentryBackend: SentryBackend = {
  captureException: (error) => console.error("[sentry:noop] captureException", error),
  captureMessage: (message, context) =>
    console.warn("[sentry:noop] captureMessage", message, context?.tags),
};

let backend: SentryBackend = consoleSentryBackend;

export function setSentryBackend(next: SentryBackend): void {
  backend = next;
}

export const Sentry = {
  captureException: (error: unknown, context?: CaptureContext): void =>
    backend.captureException(error, context),
  captureMessage: (message: string, context?: CaptureContext): void =>
    backend.captureMessage(message, context),
};

export class SentryService extends Context.Service<
  SentryService,
  {
    captureException(error: unknown, context?: CaptureContext): Effect.Effect<void>;
    captureMessage(message: string, context?: CaptureContext): Effect.Effect<void>;
  }
>()("taimei/Sentry") {}

// level は warning が既定 (ADR-0017 Decision の Sentry 項)。倒し方は呼び手が続ける
export const captureCause =
  (context?: CaptureContext) =>
  (failure: { readonly cause: unknown }): Effect.Effect<void, never, SentryService> =>
    SentryService.use((sentry) =>
      sentry.captureException(failure.cause, { level: "warning", ...context }),
    );

export const SentryLive = Layer.succeed(
  SentryService,
  SentryService.of({
    captureException: (error, context) =>
      Effect.sync(() => Sentry.captureException(error, context)),
    captureMessage: (message, context) =>
      Effect.sync(() => Sentry.captureMessage(message, context)),
  }),
);
