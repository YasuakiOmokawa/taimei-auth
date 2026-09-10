import { Context, Effect, Fiber, Layer } from "effect";
import { AsyncLocalStorage } from "node:async_hooks";

// Workers は response 後の未解決 promise を "hung" として cancel するため ctx.waitUntil に登録する。
type WaitUntil = (promise: Promise<unknown>) => void;

const waitUntilStore = new AsyncLocalStorage<WaitUntil>();

export function withWaitUntil<T>(waitUntil: WaitUntil, fn: () => T): T {
  return waitUntilStore.run(waitUntil, fn);
}

// Bun / Node は fire-and-forget (監査ログは critical path でないため取りこぼしを許容)。
export function runBackground(promise: Promise<unknown>): void {
  const waitUntil = waitUntilStore.getStore();
  if (waitUntil) waitUntil(promise);
}

export class Background extends Context.Service<
  Background,
  {
    run<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<void, never, R>;
  }
>()("taimei/Background") {}

export const BackgroundLive = Layer.succeed(
  Background,
  Background.of({
    run: (effect) =>
      Effect.gen(function* () {
        const fiber = yield* Effect.forkDetach(effect);
        runBackground(Effect.runPromise(Fiber.await(fiber)));
      }),
  }),
);
