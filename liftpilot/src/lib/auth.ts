import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@prisma/client';
import { prisma } from './db';
import { env, publicBaseUrl } from './env';
import { can, type Capability } from './rbac';
import { daysLeft, type Access } from './billing';
import { BILLING_SELECT, accessOf } from './billing-access';
import { TERMS_VERSION } from './legal';

// Session: a short JWT (HS256) in an httpOnly cookie. Every request re-reads the user from the database, so a
// deactivated user, a changed role or a password change (tokenVersion) takes effect at once — and so does the
// company's subscription (read-only without one after the trial).
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
  /** without a subscription after the trial: reads, downloads and pays, but does not write (src/lib/rbac.ts) */
  readOnly: boolean;
  /** the version of the terms this user accepted (the owner accepts for the company); null: none */
  termsVersion: string | null;
}

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
  const user = await prisma.user.findUnique({ where: { id: sub }, include: { company: { select: { name: true, active: true, ...BILLING_SELECT } } } });
  if (!user || !user.active || !user.company.active || user.tokenVersion !== tv) return null;
  const { access, billing } = await accessOf(user.companyId, user.company);
  return {
    id: user.id, email: user.email, name: user.name, role: user.role, locale: user.locale,
    companyId: user.companyId, companyName: user.company.name, mustChangePassword: user.mustChangePassword,
    access, trialDays: daysLeft(billing.trialEndsAt, new Date()), readOnly: access === 'readonly', termsVersion: user.termsVersion,
  };
});

/** The owner accepted an older version of the terms (or none): the company's acceptance is due. */
export const termsDue = (u: SessionUser): boolean => u.role === 'OWNER' && u.termsVersion !== TERMS_VERSION;

/**
 * The signed-in user, or a redirect to the login. A user with a password issued by someone else goes to the
 * account page first (allowPasswordChange marks that page and its action); an owner whose acceptance of the terms is
 * due goes to the terms' page (allowTerms marks it).
 */
export async function requireUser(locale: string, opts: { allowPasswordChange?: boolean; allowTerms?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect(`/${locale}/app/account?first=1`);
  if (termsDue(user) && !opts.allowPasswordChange && !opts.allowTerms) redirect(`/${locale}/app/terms`);
  return user;
}

/** Like requireUser, and the capability is required: otherwise the page does not exist for this user. */
export async function requireCapability(locale: string, capability: Capability): Promise<SessionUser> {
  const user = await requireUser(locale);
  if (!can(user, capability)) notFound();
  return user;
}
