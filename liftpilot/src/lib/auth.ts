import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@prisma/client';
import { prisma } from './db';
import { env, publicBaseUrl } from './env';
import { MEMBER_ROLES, can, type Capability } from './rbac';
import { daysLeft, type Access } from './billing';
import { BILLING_SELECT, accessOf } from './billing-access';
import { TERMS_VERSION } from './legal';

// Session: a short JWT (HS256) in an httpOnly cookie. Every request re-reads the user from the database, so a
// deactivated user, a changed role or a password change (tokenVersion) takes effect at once — and so do the company's
// subscription (read-only without one after the trial) and its owner's acceptance of the terms in force (read-only for
// the whole company until the owner accepts a new version; an owner who never accepted any goes to the terms first).
const COOKIE = 'liftpilot_session';
const MAX_AGE = 60 * 60 * 12; // one working day
const ISSUER = 'liftpilot';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: string;
  companyId: string;
  companyName: string;
  mustChangePassword: boolean;
  /** the company's subscription now (src/lib/billing.ts) */
  access: Access;
  /** whole days left of the trial */
  trialDays: number;
  /** without a subscription after the trial, or with the terms in force not accepted by the owner: reads, downloads,
   *  manages the colleagues and pays, but does not write (src/lib/rbac.ts) */
  readOnly: boolean;
  /** the company's acceptance of the terms in force, by its owner: accepted, an older version accepted, none ever */
  terms: TermsState;
}

export type TermsState = 'ok' | 'changed' | 'never';
const termsState = (v: string | null): TermsState => (v === TERMS_VERSION ? 'ok' : v === null ? 'never' : 'changed');

const key = (): Uint8Array => new TextEncoder().encode(env().AUTH_SECRET);

export async function startSession(user: { id: string; tokenVersion: number }): Promise<void> {
  const token = await new SignJWT({ tv: user.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: publicBaseUrl().startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

// cache(): one database read per request, however many components ask.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let sub: string, tv: number;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'], issuer: ISSUER, audience: ISSUER });
    if (typeof payload.sub !== 'string' || typeof payload.tv !== 'number') return null;
    sub = payload.sub;
    tv = payload.tv;
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: sub },
    include: { company: { select: { name: true, active: true, ...BILLING_SELECT, users: { where: { role: 'OWNER' }, select: { termsVersion: true }, take: 1 } } } },
  });
  if (!user || !user.active || !user.company.active || user.tokenVersion !== tv) return null;
  const { access, billing } = await accessOf(user.companyId, user.company);
  // a colleague of a company in read-only mode has just lost the slot (billing-access.ts)
  if (access === 'readonly' && MEMBER_ROLES.includes(user.role)) return null;
  const owner = user.role === 'OWNER' ? user : user.company.users[0];
  const terms = user.role === 'SUPERADMIN' || !owner ? 'ok' : termsState(owner.termsVersion);
  return {
    id: user.id, email: user.email, name: user.name, role: user.role, locale: user.locale,
    companyId: user.companyId, companyName: user.company.name, mustChangePassword: user.mustChangePassword,
    access, trialDays: daysLeft(billing.trialEndsAt, new Date()), readOnly: access === 'readonly' || terms !== 'ok', terms,
  };
});

/** The owner has the terms in force to accept for the company (an older version accepted, or none). */
export const termsDue = (u: SessionUser): boolean => u.role === 'OWNER' && u.terms !== 'ok';

/**
 * The signed-in user, or a redirect to the login. A user with a password issued by someone else goes to the
 * account page first (allowPasswordChange marks that page and its action); an owner who never accepted the terms goes
 * to the terms' page (allowTerms marks it). An owner who accepted an older version works on in read-only mode, with the
 * terms' page a click away (TermsBanner), so as to keep paying, cancelling and downloading.
 */
export async function requireUser(locale: string, opts: { allowPasswordChange?: boolean; allowTerms?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect(`/${locale}/app/account?first=1`);
  if (user.role === 'OWNER' && user.terms === 'never' && !opts.allowPasswordChange && !opts.allowTerms) redirect(`/${locale}/app/terms`);
  return user;
}

/** Like requireUser, and the capability is required: otherwise the page does not exist for this user. */
export async function requireCapability(locale: string, capability: Capability): Promise<SessionUser> {
  const user = await requireUser(locale);
  if (!can(user, capability)) notFound();
  return user;
}
