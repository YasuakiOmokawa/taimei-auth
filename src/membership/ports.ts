import { Context } from "effect";
import type * as repo from "@/db/repositories/membership";
import type { LiftedModule } from "../errors";

export class MembershipRepo extends Context.Service<MembershipRepo, LiftedModule<typeof repo>>()(
  "taimei/MembershipRepo",
) {}
