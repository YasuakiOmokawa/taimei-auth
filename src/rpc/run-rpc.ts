import { Code, ConnectError } from "@connectrpc/connect";
import type { Cause, Effect } from "effect";
import { Data, Exit } from "effect";
import { isWireShaped, type RouteError, settleCause } from "../handlers/wire-error";
import { type AppServices, getRuntime } from "../runtime";

// code は Connect の Code enum に限る (旧 `new ConnectError(msg, Code.X)` が持っていた enum 制約を保つ)。
export class RpcError extends Data.TaggedError("RpcError")<{
  readonly code: Code;
  readonly message: string;
}> {}

export type RpcEffect<A> = Effect.Effect<A, RouteError | RpcError, AppServices>;

const STATUS_TO_CODE: Record<number, Code> = {
  400: Code.InvalidArgument,
  401: Code.Unauthenticated,
  403: Code.PermissionDenied,
  404: Code.NotFound,
  409: Code.FailedPrecondition,
  410: Code.FailedPrecondition,
  429: Code.ResourceExhausted,
};

export const statusToCode = (status: number): Code => STATUS_TO_CODE[status] ?? Code.Internal;

export async function runRpc<A>(program: RpcEffect<A>): Promise<A> {
  const exit = await getRuntime().runPromiseExit(program);
  if (Exit.isSuccess(exit)) return exit.value;
  throw causeToConnectError(exit.cause);
}

// Connect の wire 語彙は HTTP 側より 1 つ広い: RpcError は自前の message + Code を持つ。
const isConnectWire = (e: unknown): boolean => e instanceof RpcError || isWireShaped(e);

function causeToConnectError(cause: Cause.Cause<RouteError | RpcError>): ConnectError {
  const { failure, reported } = settleCause(cause, isConnectWire, {
    label: "[runRpc]",
    tags: { handler: "runRpc" },
  });
  if (failure instanceof RpcError) return new ConnectError(failure.message, failure.code);
  if (failure) return new ConnectError(failure.error, statusToCode(failure.status));
  // consumer (packages/auth-client) は message を表示に使うため、Code.Unknown + 元 message を保ち "internal error" に潰さない。
  return ConnectError.from(reported[0]);
}
