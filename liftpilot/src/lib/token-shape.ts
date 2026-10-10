// Pure part of the e-mail links (src/lib/tokens.ts), shared by the server and the pages that read a link: their
// life and the shape of a token.

type Kind = 'VERIFY_EMAIL' | 'RESET_PASSWORD' | 'INVITE';

/** Confirming the address can wait two days; a new password must be chosen within the hour; a colleague's invitation
 *  waits a week. */
export const TOKEN_TTL_MS: Readonly<Record<Kind, number>> = { VERIFY_EMAIL: 48 * 3600_000, RESET_PASSWORD: 3600_000, INVITE: 7 * 24 * 3600_000 };

/** 32 random bytes in base64url: 43 characters of [A-Za-z0-9_-]. */
export const tokenShapeOk = (token: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(token);
