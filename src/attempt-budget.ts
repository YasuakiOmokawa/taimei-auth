import { Effect } from "effect";
import { Redis } from "./redis-service";
import { captureCause } from "./sentry";

// 数えられなければ unavailable。倒し方 (fail-closed / fail-open) は呼び手が決める: CONTEXT.md「試行枠」

export type AttemptBudgetVerdict = "accepted" | "exhausted" | "unavailable";

export const spendAttemptBudget = Effect.fn("attemptBudget.spend")(function* (input: {
  key: string;
  windowSeconds: number;
  maxAttempts: number;
  component: string;
}) {
  const redis = yield* Redis;
  const counted = yield* redis
    .incrementRateWindow(input.key, input.windowSeconds)
    .pipe(
      Effect.catchTag("RedisError", (failure) =>
        captureCause({ tags: { component: input.component } })(failure).pipe(Effect.as(null)),
      ),
    );
  // 第 2 線: 契約逸脱の 0 / NaN を accepted に写さず unavailable に倒す (throw の正本は redis.ts)
  if (!counted || !(counted.count >= 1)) return "unavailable" as const;
  return counted.count > input.maxAttempts ? ("exhausted" as const) : ("accepted" as const);
});
