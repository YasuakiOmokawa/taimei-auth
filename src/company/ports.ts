import { Context } from "effect";
import type * as repo from "@/db/repositories/company";
import type { LiftedModule } from "../errors";

export class CompanyRepo extends Context.Service<CompanyRepo, LiftedModule<typeof repo>>()(
  "taimei/CompanyRepo",
) {}
