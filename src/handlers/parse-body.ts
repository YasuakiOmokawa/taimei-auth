import { Effect } from "effect";
import type { Context } from "hono";
import { z } from "zod";
import type { Role } from "@/db/repositories/membership";
import type { ParseBody } from "../membership/guard";
import { InvalidArgument } from "../membership/guard/errors";
import type { MfaCodeKind } from "../mfa/wire-contracts";

// role を body で受ける 2 route が同じ値集合を受理するための共有 schema (片方だけ受理する非対称を防ぐ)。
// 値集合の SSOT は db/schema.ts の Role (satisfies が Role に無い値の混入を型エラーで検出する)。
export const roleBodySchema = z.enum([
  "OWNER",
  "ADMIN",
  "MEMBER",
] as const satisfies readonly Role[]);

// 桁数を縛らないのは TOTP とリカバリーコードで書式が異なり、書式判定を Transport が持つと誤入力が
// invalid_argument になり SPA の invalid_code 分岐から外れるため。string 固定は先頭 0 の保持。
export const mfaCodeSchema = z.string().min(1).max(64);

export const mfaCodeKindSchema = z.enum([
  "totp",
  "recovery_code",
] as const satisfies readonly MfaCodeKind[]);

// Effect 値なので guard が yield* するまで body を読まない (401 / 403 先行時に parse しない)。
// zod を残すのは 400 の details (zod flatten の message 文字列) が wire 契約だから (ADR-0017 Decision の zod 項)。
const parse =
  (details: boolean) =>
  <S extends z.ZodType>(c: Context, schema: S): ParseBody<z.output<S>> =>
    Effect.promise(async () => schema.safeParse(await c.req.json().catch(() => null))).pipe(
      Effect.flatMap((parsed) =>
        parsed.success
          ? Effect.succeed(parsed.data)
          : new InvalidArgument(details ? { details: parsed.error.flatten() } : {}),
      ),
    );

export const parseZodBody = parse(false);
export const parseZodBodyWithDetails = parse(true);
