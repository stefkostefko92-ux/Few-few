// The confirmations an owner gives for the company: the terms of use (the processing agreement included), acting as a
// business, the results as drafts, the clauses of arts. 1341–1342 c.c. Kept with the version and the SHA-256 of the
// text in the activity log (TERMS_ACCEPTED, USER_REGISTERED).
export const CONSENTS = ['accept', 'business', 'drafts', 'clauses'] as const;
export type Consent = (typeof CONSENTS)[number];

/** The registration form asks the first three. The specific approval of the clauses (arts. 1341–1342 c.c.) is not a
 *  tick there: it is given on the page of the e-mail link, with the password chosen at the registration (a simple
 *  electronic signature, docs/terms-changes.md), and on the terms' page with the current password. */
export const REGISTER_CONSENTS = ['accept', 'business', 'drafts'] as const;
export type RegisterConsent = (typeof REGISTER_CONSENTS)[number];
