import { Effect } from "effect";
import { Redis } from "./redis-service";
import { captureCause } from "./sentry";

// 数えられなければ unavailable。倒し方 (fail-closed / fail-open) は呼び手が決める: CONTEXT.md「試行枠」

export type AttemptBudgetVerdict = "accepted" | "exhausted" | "unavailable";

// 観測は残す (計数不能の継続は Sentry でしか気付けない)
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
  // 不変条件 (成功した INCR は必ず 1 以上) の正本は redis.ts の toRateWindowResult で、契約逸脱は
  // そこで RedisError になる。ここは第 2 線として 0 / NaN を accepted に写さず unavailable に倒す。
  if (!counted || !(counted.count >= 1)) return "unavailable" as const;
  return counted.count > input.maxAttempts ? ("exhausted" as const) : ("accepted" as const);
});
