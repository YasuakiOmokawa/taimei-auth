import { Layer } from "effect";
import * as repo from "@/db/repositories/membership";
import { liftAll } from "../errors";
import { MembershipRepo } from "./ports";

export const MembershipRepoLive = Layer.succeed(MembershipRepo, liftAll(repo));
