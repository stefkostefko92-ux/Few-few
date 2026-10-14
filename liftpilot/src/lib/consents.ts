// The confirmations an owner gives for the company, at the registration and on the terms' page: the terms of use (the
// processing agreement included), acting as a business, the results as drafts, the clauses of arts. 1341–1342 c.c.
// Kept with the version and the SHA-256 of the text in the activity log (TERMS_ACCEPTED, USER_REGISTERED).
export const CONSENTS = ['accept', 'business', 'drafts', 'clauses'] as const;
export type Consent = (typeof CONSENTS)[number];
