import { Layer } from "effect";
import * as repo from "@/db/repositories/audit-log";
import { liftAll } from "../errors";
import { AuditLog } from "./ports";

export const AuditLogLive = Layer.succeed(AuditLog, liftAll(repo));
