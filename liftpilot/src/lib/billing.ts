// The subscription, as rules: every company pays the monthly price for its owner (a Stripe Price, read from Stripe:
// never written here); the colleagues take slots bought on top of it in packs, priced as a share of the monthly price —
// 5 slots +50 %, 10 slots +80 %, unlimited +100 % (the owner's rule). A company has a trial, from its first sign-in
// with billing on; after it, without a subscription in good standing, its projects are read-only (src/lib/rbac.ts). A
// server without Stripe configured, and the platform's own company, are never billed. Pure: Stripe is src/lib/stripe.ts.
import type { SeatPack } from '@prisma/client';

export const SEAT_PACKS: readonly SeatPack[] = ['NONE', 'FIVE', 'TEN', 'UNLIMITED'];

/** The slots each pack gives and its price as a percentage of the monthly price. */
export const PACK: Readonly<Record<SeatPack, { seats: number; pct: number }>> = {
  NONE: { seats: 0, pct: 0 },
  FIVE: { seats: 5, pct: 50 },
  TEN: { seats: 10, pct: 80 },
  UNLIMITED: { seats: Infinity, pct: 100 },
};

/** The pack's monthly amount [cents] for the monthly price `base` [cents], rounded to the cent. */
export const packAmount = (base: number, pack: SeatPack): number => Math.round((base * PACK[pack].pct) / 100);

/** What the company may do now: no billing (`free`: Stripe off or the platform's company), its trial, a subscription in
 *  good standing (`active`), one whose payment failed and is being retried (`grace`: Stripe's dunning), or nothing
 *  (`readonly`). */
export type Access = 'free' | 'trial' | 'active' | 'grace' | 'readonly';

export interface CompanyBilling {
  billingExempt: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  seatPack: SeatPack;
}

const GOOD = new Set(['active', 'trialing']);

export function companyAccess(c: CompanyBilling, now: Date, configured: boolean): Access {
  if (!configured || c.billingExempt) return 'free';
  if (c.subscriptionStatus && GOOD.has(c.subscriptionStatus)) return 'active';
  if (c.subscriptionStatus === 'past_due') return 'grace';
  if (c.trialEndsAt && c.trialEndsAt.getTime() > now.getTime()) return 'trial';
  return 'readonly';
}

/** How many colleagues the company may have active: unlimited without billing; the pack's while the subscription is in
 *  good standing or being retried; none otherwise (the trial is the owner's alone). */
export function seatLimit(c: CompanyBilling, access: Access): number {
  if (access === 'free') return Infinity;
  return access === 'active' || access === 'grace' ? PACK[c.seatPack].seats : 0;
}

/** Whether one more colleague may be activated: within the limit, and never while a payment is being retried (the
 *  colleagues already active keep working). */
export const seatFree = (c: CompanyBilling, access: Access, used: number): boolean => access !== 'grace' && used < seatLimit(c, access);

/** The pack read back from the subscription's metadata (set by the server only); NONE when absent or unknown. */
export const packOf = (x: unknown): SeatPack => (SEAT_PACKS.find((p) => p === x) ?? 'NONE');

/** The pack a subscription pays: the one its metadata names when the line of the slots costs that pack's share of the
 *  owner's line, else the only pack whose share it costs, else none (the slots follow what is paid, not the metadata).
 *  `base` and `seats` in cents per period; `seats` null: no line of slots. */
export function packPaid(base: number | null, seats: number | null, named: SeatPack): SeatPack {
  if (seats === null || base === null || base <= 0) return 'NONE';
  const fits = (p: SeatPack): boolean => p !== 'NONE' && packAmount(base, p) === seats;
  if (fits(named)) return named;
  const found = SEAT_PACKS.filter(fits);
  return found.length === 1 ? found[0] : 'NONE';
}

/** Whole days left until `end` (0 when past or none). */
export const daysLeft = (end: Date | null, now: Date): number => (end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))) : 0);

/** The end of a new company's trial. */
export const trialEnd = (from: Date, days: number): Date => new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
