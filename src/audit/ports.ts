import { Context } from "effect";
import type * as repo from "@/db/repositories/audit-log";
import type { LiftedModule } from "../errors";

export class AuditLog extends Context.Service<AuditLog, LiftedModule<typeof repo>>()(
  "taimei/AuditLog",
) {}
