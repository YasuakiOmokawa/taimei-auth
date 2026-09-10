import { Context } from "effect";
import type * as repo from "@/db/repositories/invitation";
import type { LiftedModule } from "../errors";

export class InvitationRepo extends Context.Service<InvitationRepo, LiftedModule<typeof repo>>()(
  "taimei/InvitationRepo",
) {}
