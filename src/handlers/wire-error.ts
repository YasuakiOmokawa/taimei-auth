import { Cause, Predicate } from "effect";
import { type BoundaryError, isBoundaryError } from "../errors";
import { type CaptureContext, Sentry } from "../sentry";
import type { CompanyError } from "../company/errors";
import type { InvitationError } from "../invitation/errors";
import type { MembershipError } from "../membership/errors";
import type { GuardError } from "../membership/guard/errors";
import type { MfaError } from "../mfa/error-mapping";
import type { MfaWireErrorCode } from "../mfa/wire-contracts";

export type DomainError = MembershipError | CompanyError | InvitationError;

export type WireError = GuardError | DomainError | MfaError;

type GuardCodesOnMfaRoutes = "unauthorized" | "invalid_argument";
const _guardCodesReachMfaWire: [GuardCodesOnMfaRoutes] extends [GuardError["error"]]
  ? [GuardCodesOnMfaRoutes] extends [MfaWireErrorCode]
    ? true
    : never
  : never = true;

export type RouteError = WireError | BoundaryError;

// 成功 response (c.json) と byte-invariant にするため charset 無しの application/json を明示する。
export const JSON_HEADERS = { "content-type": "application/json" } as const;

export function wireErrorResponse(failure: WireError): Response {
  const body: { error: string; details?: unknown } = { error: failure.error };
  if ("details" in failure && failure.details !== undefined) body.details = failure.details;
  return new Response(JSON.stringify(body), { status: failure.status, headers: JSON_HEADERS });
}

const TEXT_HEADERS = { "content-type": "text/plain; charset=UTF-8" } as const;

export function internalErrorResponse(): Response {
  return new Response("Internal Server Error", { status: 500, headers: TEXT_HEADERS });
}

// catalog 外の failure が status: undefined → 200 で fail-open しないよう実行時にも形を見る。
export const isWireShaped = (e: unknown): e is { error: string; status: number } =>
  Predicate.isObject(e) && Predicate.isString(e.error) && Predicate.isNumber(e.status);

type Report = Pick<CaptureContext, "tags" | "extra"> & { label: string };

const toInternal = (e: unknown) =>
  isBoundaryError(e)
    ? { error: e.cause, level: "warning" as const }
    : { error: e, level: "error" as const };

const send = ({ error, level }: ReturnType<typeof toInternal>, { label, ...context }: Report) => {
  console.error(label, error);
  Sentry.captureException(error, { ...context, level });
};

export function settleCause<E>(
  cause: Cause.Cause<E>,
  isWire: (e: unknown) => boolean,
  report: Report,
): { failure: Exclude<E, BoundaryError> | undefined; reported: readonly unknown[] } {
  let failure: Exclude<E, BoundaryError> | undefined;
  const internal: ReturnType<typeof toInternal>[] = [];
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason)) {
      if (!isBoundaryError(reason.error) && isWire(reason.error))
        failure ??= reason.error as Exclude<E, BoundaryError>;
      else internal.push(toInternal(reason.error));
    } else if (Cause.isDieReason(reason)) internal.push(toInternal(reason.defect));
  }
  if (failure === undefined && internal.length === 0) {
    internal.push(toInternal(new Error(Cause.pretty(cause))));
  }
  for (const r of internal) send(r, report);
  return { failure, reported: internal.map((r) => r.error) };
}

// Effect の外の throw を同じ規則で送る (握る理由: ADR-0017「実装の機構」)
export function captureThrown(error: unknown, component: string): void {
  try {
    send(toInternal(error), { label: `[${component}]`, tags: { component } });
  } catch (reportError) {
    console.error(`[${component}] failed to report to Sentry`, reportError);
  }
}
