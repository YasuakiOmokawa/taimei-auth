import { Cause, Predicate } from "effect";
import { type BoundaryError, isBoundaryError } from "../errors";
import { type CaptureContext, Sentry } from "../sentry";
import type { CompanyError } from "../company/errors";
import type { InvitationError } from "../invitation/errors";
import type { MembershipError } from "../membership/errors";
import type { GuardError } from "../membership/guard/errors";
import type { MfaError } from "../mfa/error-mapping";
import type { MfaWireErrorCode } from "../mfa/wire-contracts";

// Transport の wire 直列化 (ADR-0017 Decision の境界表 2 行目)。旧 membership/guard/respond.ts の error response 生成を
// 引き継ぎ、明示 header で charset 無しの application/json を付けて成功 response と byte-invariant を保つ。
// Web 標準 Response だけを組み、hono には依存しない。末尾の settleCause と captureThrown だけは Sentry への
// 報告口で副作用 (console.error + Sentry) を持つ。

// domain failure (use-case が返す) も wire code / status を自身で持つ (各 domain の errors.ts)。
export type DomainError = MembershipError | CompanyError | InvitationError;

// MFA の failure class (src/mfa/error-mapping.ts) も同じ形 ({ error, status }) で E channel に載る。
export type WireError = GuardError | DomainError | MfaError;

// 型で固定する不変条件 (ADR-0017 Decision の failure 項、catalog 分散の整合): MFA route に到達する guard 由来の code (requireActor の unauthorized / parseZodBody の
// invalid_argument) が GuardError の class と MFA の wire 語彙 (MfaWireErrorCode) の両方に存在する
// (どちらかから落ちると typecheck が落ちる)。MFA 自身の code は mfa/error-mapping.ts の検出器が縛る。
type GuardCodesOnMfaRoutes = "unauthorized" | "invalid_argument";
const _guardCodesReachMfaWire: [GuardCodesOnMfaRoutes] extends [GuardError["error"]]
  ? [GuardCodesOnMfaRoutes] extends [MfaWireErrorCode]
    ? true
    : never
  : never = true;

// runRoute / runRpc が受ける failure の全体。boundary error は wire に出さず 500 + Sentry に写像する。
export type RouteError = WireError | BoundaryError;

// 成功 response (c.json) と同じ charset 無しの content-type。
export const JSON_HEADERS = { "content-type": "application/json" } as const;

export function wireErrorResponse(failure: WireError): Response {
  const body: { error: string; details?: unknown } = { error: failure.error };
  // details を持つ failure (InvalidArgument) だけ載せ、undefined のときは key 自体を出さない (byte-invariant)。
  if ("details" in failure && failure.details !== undefined) body.details = failure.details;
  return new Response(JSON.stringify(body), { status: failure.status, headers: JSON_HEADERS });
}

// Hono 既定の errorHandler (`c.text("Internal Server Error", 500)`) と同じ body / status / content-type。
// 旧経路と byte-invariant。
const TEXT_HEADERS = { "content-type": "text/plain; charset=UTF-8" } as const;

export function internalErrorResponse(): Response {
  return new Response("Internal Server Error", { status: 500, headers: TEXT_HEADERS });
}

// catalog 外の failure class が E に紛れた時に `status: undefined` → 200 で fail-open しないよう、実行時にも形を見る。
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
