import 'server-only';
import type { PendingRegistration, User } from '@prisma/client';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { prisma } from './db';
import { auditTx } from './audit';
import { REGISTER_CONSENTS } from './consents';
import { TERMS_VERSION, UNCONFIRMED_DAYS } from './legal';
import { clausesProof, legalSha256 } from './legal-text';
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

/** A registration waiting for its address, with the token of its link (for the e-mail); `betaInviteId` the beta
 *  invitation it was made with (src/lib/beta-invites.ts), used up when the registration is confirmed. */
export async function addPending(d: RegisterInput, passwordHash: string, locale: Locale, betaInviteId: string | null = null): Promise<string> {
  const { token, tokenHash } = newToken(), now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.pendingRegistration.create({
      data: {
        email: d.email, tokenHash, expiresAt: linkEnd(now, now.getTime()), passwordHash, name: d.name, company: d.company,
        vatNumber: d.vatNumber, city: d.city, locale, termsVersion: TERMS_VERSION, termsSha256: legalSha256(locale), betaInviteId, createdAt: now,
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
  /** the link was used or is over, or its beta invitation was used meanwhile */
  | { ok: false; reason: 'link' }
  /** the address has an account confirmed or used meanwhile: this registration ends */
  | { ok: false; reason: 'taken' };

/** How the registration is confirmed at the link (src/server/account-actions.ts): the language of the page whose clauses
 *  were approved, and whether the person accepted there the terms in force too — a registration made under an earlier
 *  version, confirmed after a new one was published, takes the version in force (with its SHA-256) instead of its own,
 *  so that the clauses approved and the terms accepted are the same text. */
export interface Approval {
  locale: Locale;
  renewTerms: boolean;
}

/** The registration confirmed (the password already checked against it): in one transaction the link is used, the
 *  beta invitation it was made with is used up (one company per invitation: already used, nothing is made), an
 *  account of the address never confirmed nor used is released (with its company when it was the last user — and that
 *  company's beta invitations), the other registrations of the address go, the company and its owner are made — signed
 *  in, confirmed and with the clauses approved now —, and the proof of the approval is written in the activity log with
 *  them (USER_REGISTERED: the terms, the consents, the SHA-256 of the clauses as shown and their articles): an account
 *  never exists without it. The companies' invitations of the address stay until their end (taking one meets the
 *  account: one address, one company), so no company learns of the registration. */
export async function confirmPending(p: PendingRegistration, token: string, approval: Approval): Promise<Confirmed> {
  const now = new Date();
  const terms = approval.renewTerms
    ? { version: TERMS_VERSION, sha256: legalSha256(approval.locale), locale: approval.locale, acceptedAt: now }
    : { version: p.termsVersion, sha256: p.termsSha256, locale: p.locale, acceptedAt: p.createdAt };
  return prisma.$transaction(async (tx): Promise<Confirmed> => {
    const used = await tx.pendingRegistration.deleteMany({ where: { id: p.id, tokenHash: hashToken(token), expiresAt: { gt: now } } });
    if (used.count !== 1) return { ok: false, reason: 'link' };
    // the invitation first, before anything is made: of two registrations confirmed at once with it, the row lock lets
    // one through and the other finds it used
    if (p.betaInviteId && (await tx.betaInvite.updateMany({ where: { id: p.betaInviteId, usedAt: null }, data: { usedAt: now } })).count !== 1) {
      return { ok: false, reason: 'link' };
    }
    const old = await tx.user.findUnique({ where: { email: p.email }, select: { id: true, companyId: true, emailVerifiedAt: true, lastLoginAt: true } });
    let released: Released | null = null;
    if (old) {
      const unused = !old.emailVerifiedAt && !old.lastLoginAt;
      if (!unused || (await tx.user.deleteMany({ where: { id: old.id, emailVerifiedAt: null, lastLoginAt: null } })).count !== 1) return { ok: false, reason: 'taken' };
      // a company left without users goes, and its beta invitations with it (the address and the note are personal data)
      await tx.betaInvite.deleteMany({ where: { companyId: old.companyId, company: { users: { none: {} } } } });
      const gone = (await tx.company.deleteMany({ where: { id: old.companyId, users: { none: {} } } })).count === 1;
      released = { id: old.id, companyId: gone ? null : old.companyId };
    }
    await tx.pendingRegistration.deleteMany({ where: { email: p.email } });
    const c = await tx.company.create({ data: { name: p.company, vatNumber: p.vatNumber, city: p.city } });
    if (p.betaInviteId) await tx.betaInvite.update({ where: { id: p.betaInviteId }, data: { companyId: c.id } });
    const user = await tx.user.create({
      data: {
        // a registration made in English or Bulgarian (before 2026-10-12) gives an account in Italian; the audit keeps the
        // language of the text accepted
        companyId: c.id, email: p.email, name: p.name, role: 'OWNER', passwordHash: p.passwordHash, mustChangePassword: false,
        locale: isLocale(p.locale) ? p.locale : DEFAULT_LOCALE,
        emailVerifiedAt: now, lastLoginAt: now, termsAcceptedAt: terms.acceptedAt, termsVersion: terms.version, clausesApprovedAt: now,
      },
    });
    // the company that had added the address hears why its colleague is gone
    if (released?.companyId) await auditTx(tx, { companyId: released.companyId, userId: null, action: 'USER_RELEASED', entity: 'User', entityId: released.id });
    // what was accepted at the registration (or, under an earlier version, at the link), and the clauses approved through
    // the link with the password: the version, the SHA-256 of the terms and of the clauses as shown, their articles
    await auditTx(tx, { companyId: c.id, userId: user.id, action: 'USER_REGISTERED', entity: 'User', entityId: user.id, meta: {
      terms: terms.version, sha256: terms.sha256, locale: terms.locale, consents: [...REGISTER_CONSENTS],
      ...(approval.renewTerms ? { termsAcceptedVia: 'email-link+password', registeredTerms: p.termsVersion, registeredSha256: p.termsSha256 } : {}),
      clausesApprovedAt: now.toISOString(), clausesVia: 'email-link+password', clausesLocale: approval.locale, ...clausesProof(approval.locale),
      registeredAt: p.createdAt.toISOString(), released: released !== null, betaInvite: p.betaInviteId !== null,
    } });
    await auditTx(tx, { companyId: c.id, userId: user.id, action: 'EMAIL_VERIFIED', entity: 'User', entityId: user.id });
    return { ok: true, user, released };
  });
}
