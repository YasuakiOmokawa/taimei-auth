// 表示とチャレンジ要否の 2 読み手は必ずこの述語を通し、verified_at を直接比較しない。
export function requiresMfaChallenge(enrollment: { verifiedAt: Date | null } | undefined): boolean {
  return enrollment !== undefined && enrollment.verifiedAt !== null;
}
