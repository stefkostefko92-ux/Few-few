import 'server-only';
import type { PendingRegistration, User } from '@prisma/client';
import type { Locale } from '@/i18n/locales';
import { prisma } from './db';
import { TERMS_VERSION, UNCONFIRMED_DAYS } from './legal';
import { legalSha256 } from './legal-text';
import type { RegisterInput } from './schemas';
import { hashToken } from './token-hash';
import { TOKEN_TTL_MS, newToken, tokenShapeOk } from './tokens';

// The self-registrations waiting for the proof of their address (PendingRegistration): no account exists until the
// link of the e-mail and the password chosen confirm one, so a registration with somebody else's address holds and
// takes nothing. Several wait side by side for one address; the first confirmed makes the company and its owner,
// releases an account of the address never confirmed nor used (a colleague a company added, or a registration from
// before they waited apart) and drops the others.

/** at most this many waiting for one address: the oldest gives way (three a hour can be made for one address) */
const PENDING_MAX = 10;
const DAY_MS = 24 * 3600_000;

/** A link's end: its life, never beyond UNCONFIRMED_DAYS after the registration. */
const linkEnd = (createdAt: Date, now: number): Date => new Date(Math.min(now + TOKEN_TTL_MS.VERIFY_EMAIL, createdAt.getTime() + UNCONFIRMED_DAYS * DAY_MS));

/** A registration waiting for its address, with the token of its link (for the e-mail). */
export async function addPending(d: RegisterInput, passwordHash: string, locale: Locale): Promise<string> {
  const { token, tokenHash } = newToken(), now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.pendingRegistration.create({
      data: {
        email: d.email, tokenHash, expiresAt: linkEnd(now, now.getTime()), passwordHash, name: d.name, company: d.company,
        vatNumber: d.vatNumber, city: d.city, locale, termsVersion: TERMS_VERSION, termsSha256: legalSha256(locale), createdAt: now,
      },
    });
    const older = await tx.pendingRegistration.findMany({ where: { email: d.email }, orderBy: { createdAt: 'desc' }, skip: PENDING_MAX, select: { id: true } });
    if (older.length) await tx.pendingRegistration.deleteMany({ where: { id: { in: older.map((p) => p.id) } } });
  });
  return token;
}

/** The registration of a link still good, or null. */
export async function pendingOf(token: string): Promise<PendingRegistration | null> {
  if (!tokenShapeOk(token)) return null;
  const p = await prisma.pendingRegistration.findUnique({ where: { tokenHash: hashToken(token) } });
  return p && p.expiresAt > new Date() ? p : null;
}

/** The newest registration still waiting for the address (signing in with its password sends its link again). */
export const newestPending = (email: string): Promise<PendingRegistration | null> =>
  prisma.pendingRegistration.findFirst({ where: { email, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });

/** A new link for the registration (the earlier one stops), or null when its time is over. */
export async function renewPending(p: PendingRegistration): Promise<string | null> {
  const now = Date.now(), end = linkEnd(p.createdAt, now);
  if (end.getTime() <= now) return null;
  const { token, tokenHash } = newToken();
  const n = await prisma.pendingRegistration.updateMany({ where: { id: p.id, expiresAt: { gt: new Date(now) } }, data: { tokenHash, expiresAt: end } });
  return n.count === 1 ? token : null;
}

/** The account the confirmation released, and its company unless it went with it (it had no other user). */
export interface Released {
  id: string;
  companyId: string | null;
}

export type Confirmed =
  | { ok: true; user: User; released: Released | null }
  /** the link was used or is over */
  | { ok: false; reason: 'link' }
  /** the address has an account confirmed or used meanwhile: this registration ends */
  | { ok: false; reason: 'taken' };

/** The registration confirmed (the password already checked against it): in one transaction the link is used, an
 *  account of the address never confirmed nor used is released (with its company when it was the last user), the
 *  other registrations of the address go and so do the companies' invitations of it (one address, one company), the
 *  company and its owner are made — signed in and confirmed now. */
export async function confirmPending(p: PendingRegistration, token: string): Promise<Confirmed> {
  const now = new Date();
  return prisma.$transaction(async (tx): Promise<Confirmed> => {
    const used = await tx.pendingRegistration.deleteMany({ where: { id: p.id, tokenHash: hashToken(token), expiresAt: { gt: now } } });
    if (used.count !== 1) return { ok: false, reason: 'link' };
    const old = await tx.user.findUnique({ where: { email: p.email }, select: { id: true, companyId: true, emailVerifiedAt: true, lastLoginAt: true } });
    let released: Released | null = null;
    if (old) {
      const unused = !old.emailVerifiedAt && !old.lastLoginAt;
      if (!unused || (await tx.user.deleteMany({ where: { id: old.id, emailVerifiedAt: null, lastLoginAt: null } })).count !== 1) return { ok: false, reason: 'taken' };
      const gone = (await tx.company.deleteMany({ where: { id: old.companyId, users: { none: {} } } })).count === 1;
      released = { id: old.id, companyId: gone ? null : old.companyId };
    }
    await tx.pendingRegistration.deleteMany({ where: { email: p.email } });
    await tx.invite.deleteMany({ where: { email: p.email } });
    const c = await tx.company.create({ data: { name: p.company, vatNumber: p.vatNumber, city: p.city } });
    const user = await tx.user.create({
      data: {
        companyId: c.id, email: p.email, name: p.name, role: 'OWNER', passwordHash: p.passwordHash, mustChangePassword: false, locale: p.locale,
        emailVerifiedAt: now, lastLoginAt: now, termsAcceptedAt: p.createdAt, termsVersion: p.termsVersion,
      },
    });
    return { ok: true, user, released };
  });
}
