import 'server-only';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { prisma } from './db';
import { publicBaseUrl } from './env';
import { hashToken } from './token-hash';
import { BETA_INVITE_DAYS } from './token-shape';
import { newToken, tokenShapeOk } from './tokens';

// The beta by invitation (round 48): the platform administrator invites a tester's address; while REGISTRATION_MODE is
// `invite` only the invitation's link opens the registration form, for that address only (src/server/account-actions.ts).
// The token travels in the link's fragment (`/register#<token>`, like every e-mail link: src/components/useLinkToken.ts),
// so it never reaches a server log or a Referer; the database keeps its SHA-256. One company per invitation: the
// confirmation of the registration uses it up in the transaction that makes the company (src/lib/registrations.ts).

export { BETA_INVITE_DAYS };
const DAY_MS = 24 * 3600_000;
const linkEnd = (): Date => new Date(Date.now() + BETA_INVITE_DAYS * DAY_MS);

/** The registration page of an invitation, as the e-mail and the administrator's screen give it. */
export const betaInviteLink = (token: string): string => `${publicBaseUrl()}/${DEFAULT_LOCALE}/register#${token}`;

/** A new invitation of `email` (already normalized by emailSchema) with the administrator's note: its id and token. */
export async function createBetaInvite(email: string, note: string | null, createdById: string): Promise<{ id: string; token: string }> {
  const { token, tokenHash } = newToken();
  const row = await prisma.betaInvite.create({ data: { email, note, createdById, tokenHash, expiresAt: linkEnd() }, select: { id: true } });
  return { id: row.id, token };
}

export interface ValidBetaInvite {
  id: string;
  email: string;
}

/** The invitation of a link still good (not used, not past its end), or null. Reading it changes nothing. */
export async function betaInviteOf(token: string): Promise<ValidBetaInvite | null> {
  if (!tokenShapeOk(token)) return null;
  const row = await prisma.betaInvite.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, email: true, usedAt: true, expiresAt: true } });
  return row && !row.usedAt && row.expiresAt > new Date() ? { id: row.id, email: row.email } : null;
}

export type BetaInviteState = 'waiting' | 'used' | 'expired';

/** Used once a company was made with it, past its end otherwise, else still waiting. */
export const betaInviteState = (r: { usedAt: Date | null; expiresAt: Date }, now: Date): BetaInviteState =>
  r.usedAt ? 'used' : r.expiresAt <= now ? 'expired' : 'waiting';

export interface BetaInviteRow {
  id: string;
  email: string;
  note: string | null;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  /** the company it made (null once that company was deleted) */
  company: string | null;
  state: BetaInviteState;
}

/** The invitations for the administrator's page, newest first. */
export async function listBetaInvites(now = new Date()): Promise<BetaInviteRow[]> {
  const rows = await prisma.betaInvite.findMany({
    orderBy: { createdAt: 'desc' }, take: 500,
    select: { id: true, email: true, note: true, createdAt: true, expiresAt: true, usedAt: true, company: { select: { name: true } } },
  });
  return rows.map(({ company, ...r }) => ({ ...r, company: company?.name ?? null, state: betaInviteState(r, now) }));
}

/** A new link for an invitation not used yet (the earlier one stops) and BETA_INVITE_DAYS from now: its address and
 *  token, or null when it is gone or used. */
export async function renewBetaInvite(id: string): Promise<{ email: string; token: string } | null> {
  const row = await prisma.betaInvite.findFirst({ where: { id, usedAt: null }, select: { email: true } });
  if (!row) return null;
  const { token, tokenHash } = newToken();
  const n = await prisma.betaInvite.updateMany({ where: { id, usedAt: null }, data: { tokenHash, expiresAt: linkEnd() } });
  return n.count === 1 ? { email: row.email, token } : null;
}

/** Withdraws an invitation not used yet: the registrations waiting with it go too (ON DELETE CASCADE). A used one
 *  stays, as the record of the company it made. */
export async function revokeBetaInvite(id: string): Promise<boolean> {
  return (await prisma.betaInvite.deleteMany({ where: { id, usedAt: null } })).count === 1;
}
