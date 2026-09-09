import type { Cause } from "effect";
import { Effect, Exit } from "effect";
import type { Context, Next } from "hono";
import { type AppServices, getRuntime } from "../runtime";
import {
  internalErrorResponse,
  isWireShaped,
  type RouteError,
  settleCause,
  wireErrorResponse,
} from "./wire-error";

// Hono は handler の Error を飲み込んで 500 を返し rethrow しない (hono-base.js の errorHandler) ため、Sentry 送信は adapter が担う。

export type RouteEffect<A> = Effect.Effect<A, RouteError, AppServices>;

export async function runRoute(c: Context, program: RouteEffect<Response>): Promise<Response> {
  const exit = await getRuntime().runPromiseExit(program);
  if (Exit.isSuccess(exit)) return exit.value;
  return causeToResponse(c, exit.cause, "runRoute");
}

// middleware 版。program が Response を返せば短絡、undefined なら next() に進む。
export async function runMiddleware(
  c: Context,
  next: Next,
  program: RouteEffect<Response | undefined>,
): Promise<Response | undefined> {
  const exit = await getRuntime().runPromiseExit(program);
  if (!Exit.isSuccess(exit)) return causeToResponse(c, exit.cause, "runMiddleware");
  if (exit.value) return exit.value;
  await next();
  return undefined;
}

type Adapter = "runRoute" | "runMiddleware";

function causeToResponse(c: Context, cause: Cause.Cause<RouteError>, adapter: Adapter): Response {
  const { failure } = settleCause(cause, isWireShaped, {
    label: `[${adapter}] ${c.req.method} ${c.req.path}`,
    tags: { handler: adapter },
    extra: { method: c.req.method, path: c.req.path },
  });
  const res = failure ? wireErrorResponse(failure) : internalErrorResponse();
  // program が c.header() で staged した header (login-shortcut の Cache-Control / Vary 等) を error 応答にも
  // 載せる。c.newResponse は staged header に res の header と status を重ねる (Hono 既定 errorHandler と同じ形)。
  return c.newResponse(res.body, res);
}
