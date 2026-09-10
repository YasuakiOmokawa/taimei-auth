// server と SPA が同じ形を要求する。片側だけ変えると一方が silent に脱落する (PR #116 の退行と同面)。
export const acceptInvitationPath = (invitationToken: string): string =>
  `/auth/signup/accept-invitation?invitation_token=${encodeURIComponent(invitationToken)}`;
