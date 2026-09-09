import { Layer } from "effect";
import * as repo from "@/db/repositories/membership";
import { liftAll } from "../errors";
import { MembershipRepo } from "./ports";

// module ロード時に bind してよい理由は db/CLAUDE.md の workerd gotcha (関数は request 横断で共有でき、Pool は ALS が per-request に供給する)。
export const MembershipRepoLive = Layer.succeed(MembershipRepo, liftAll(repo));
