export type MfaTotpActor = { id: string; email: string };

export type TotpEnrollmentMaterial = {
  enrollmentId: string;
  totpUri: string;
  recoveryCodes: string[];
};

export type TotpSessionChanges = { sessionChanges: Headers };
