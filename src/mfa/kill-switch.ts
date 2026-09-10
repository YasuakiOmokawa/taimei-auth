// off は "false" のみに限る fail-safe 既定。
export function isMfaChallengeEnabled(raw: string | undefined): boolean {
  return raw !== "false";
}
