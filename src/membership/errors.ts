import { Data } from "effect";

export class LastOwner extends Data.TaggedError("LastOwner") {
  readonly error = "last_owner" as const;
  readonly status = 409 as const;
}

export type MembershipError = LastOwner;
