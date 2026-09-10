import { Clock, Effect } from "effect";
import { Redis, withRedisRetry } from "./redis-service";

// Upstash free tier は 30 日データ操作が無いと DB をアーカイブし REST endpoint を消す (2026-09-03 本番障害)。
export const REDIS_KEEPALIVE_KEY = "keepalive:last-touched-at";

const KEEPALIVE_TTL_SEC = 7 * 24 * 60 * 60;

export const touchRedisKeepAliveProgram = Effect.gen(function* () {
  const redis = yield* Redis;
  const now = yield* Clock.currentTimeMillis;
  yield* redis.set(REDIS_KEEPALIVE_KEY, new Date(now).toISOString(), KEEPALIVE_TTL_SEC);
}).pipe(withRedisRetry);
