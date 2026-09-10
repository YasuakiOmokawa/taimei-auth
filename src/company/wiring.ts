import { Layer } from "effect";
import * as repo from "@/db/repositories/company";
import { liftAll } from "../errors";
import { CompanyRepo } from "./ports";

export const CompanyRepoLive = Layer.succeed(CompanyRepo, liftAll(repo));
