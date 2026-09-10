import { Layer } from "effect";
import * as repo from "@/db/repositories/invitation";
import { liftAll } from "../errors";
import { InvitationRepo } from "./ports";

export const InvitationRepoLive = Layer.succeed(InvitationRepo, liftAll(repo));
