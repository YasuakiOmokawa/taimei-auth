import { Context } from "effect";
import type * as repo from "@/db/repositories/health";
import type { LiftedModule } from "../errors";

export class HealthRepo extends Context.Service<HealthRepo, LiftedModule<typeof repo>>()(
  "taimei/HealthRepo",
) {}
