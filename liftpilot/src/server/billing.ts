import 'server-only';
// The subscription on the server: the company's state from its last verified Stripe event, the slots it uses, the sync
// of a subscription from Stripe (the source of truth: always read back, never taken from the browser) and the limit of
// the slots enforced when it drops (the newest colleagues beyond it are deactivated; the owner chooses whom to bring
// back once there is room).
import type Stripe from 'stripe';
import type { Prisma, SeatPack } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { MEMBER_ROLES } from '@/lib/rbac';
import { companyAccess, daysLeft, packOf, packPaid, seatFree, seatLimit, type Access } from '@/lib/billing';
import { BILLING_SELECT, accessOf } from '@/lib/billing-access';
import { billingConfig, billingConfigured } from '@/lib/billing-config';
import { idSchema } from '@/lib/schemas';

type Db = Prisma.TransactionClient | typeof prisma;
const LIVE = new Set(['active', 'trialing', 'past_due']);
const ENDED = new Set(['canceled', 'incomplete_expired']);

/** The active colleagues of a company: each takes a slot (the owner does not). */
export const seatsUsed = (companyId: string, db: Db = prisma): Promise<number> =>
  db.user.count({ where: { companyId, active: true, role: { in: [...MEMBER_ROLES] } } });

export interface CompanySubscription {
  access: Access;
  seatPack: SeatPack;
  limit: number;
  used: number;
  /** one more colleague may be activated now */
  free: boolean;
  trialEndsAt: Date | null;
  /** whole days left of the trial */
  trialDays: number;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  status: string | null;
  customerId: string | null;
  /** a subscription Stripe still bills (active, in its trial or being retried) */
  subscriptionId: string | null;
}

export async function companySubscription(companyId: string): Promise<CompanySubscription | null> {
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { ...BILLING_SELECT, periodEnd: true, cancelAtPeriodEnd: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!c) return null;
  const { access, billing } = await accessOf(companyId, c);
  const used = await seatsUsed(companyId);
  return {
    access, seatPack: billing.seatPack, limit: seatLimit(billing, access), used, free: seatFree(billing, access, used), trialEndsAt: billing.trialEndsAt,
    trialDays: daysLeft(billing.trialEndsAt, new Date()),
    periodEnd: c.periodEnd, cancelAtPeriodEnd: c.cancelAtPeriodEnd, status: c.subscriptionStatus, customerId: c.stripeCustomerId,
    subscriptionId: c.stripeSubscriptionId && c.subscriptionStatus && LIVE.has(c.subscriptionStatus) ? c.stripeSubscriptionId : null,
  };
}

/** In a transaction: locks the company until the transaction ends (two colleagues added or brought back at once do not
 *  both take the last slot; whatever is read after it is current). */
export async function lockCompany(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;
}

/** In a transaction: locks the company and says whether one more colleague may be activated. */
export async function seatAvailable(tx: Prisma.TransactionClient, companyId: string): Promise<boolean> {
  await lockCompany(tx, companyId);
  const c = await tx.company.findUnique({ where: { id: companyId }, select: BILLING_SELECT });
  if (!c) return false;
  return seatFree(c, companyAccess(c, new Date(), billingConfigured()), await seatsUsed(companyId, tx));
}

/** Deactivates the newest colleagues beyond the company's limit (their sessions end at once). */
export async function enforceSeats(companyId: string): Promise<number> {
  const extra = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;
    const c = await tx.company.findUnique({ where: { id: companyId }, select: BILLING_SELECT });
    if (!c) return [];
    // in a first trial nobody new joins, but colleagues already there (a company older than the billing) stay until a
    // subscription says how many slots it pays; a subscription that ended during the trial counts as one
    const access = companyAccess(c, new Date(), billingConfigured()), limit = seatLimit(c, access);
    if ((access === 'trial' && !c.subscriptionStatus) || !Number.isFinite(limit)) return [];
    const members = await tx.user.findMany({
      where: { companyId, active: true, role: { in: [...MEMBER_ROLES] } }, orderBy: { createdAt: 'desc' }, select: { id: true },
    });
    const ids = members.slice(0, Math.max(0, members.length - limit)).map((u) => u.id);
    if (ids.length) await tx.user.updateMany({ where: { id: { in: ids }, companyId }, data: { active: false, tokenVersion: { increment: 1 } } });
    return ids;
  });
  if (!extra.length) return 0;
  await audit({ companyId, userId: null, action: 'SEATS_ENFORCED', entity: 'Company', entityId: companyId, meta: { deactivated: extra.length } });
  log.info({ companyId, deactivated: extra.length }, 'seats enforced');
  return extra.length;
}

const idOf = (x: string | { id: string } | null): string | null => (x === null ? null : typeof x === 'string' ? x : x.id);
const lineCents = (i: Stripe.SubscriptionItem): number => (i.price.unit_amount ?? 0) * (i.quantity ?? 1);

/** The pack the subscription pays (src/lib/billing.ts packPaid): its line of slots against the owner's line. */
function paidPack(sub: Stripe.Subscription, productSeats: string): SeatPack {
  const seats = sub.items.data.filter((i) => idOf(i.price.product) === productSeats);
  const base = sub.items.data.find((i) => idOf(i.price.product) !== productSeats);
  const named = packOf(sub.metadata.pack);
  const pack = packPaid(base ? lineCents(base) : null, seats.length ? seats.reduce((s, i) => s + lineCents(i), 0) : null, named);
  if (pack !== named) log.warn({ subscription: sub.id, named, pack }, 'the slots follow what the subscription pays, not its metadata');
  return pack;
}

/** The subscription as the company keeps it; the company found by its id in the metadata (set by the server), by the
 *  subscription or by the customer. Returns the company's id, or null when none matches. */
export async function syncSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const cfg = billingConfig();
  if (!cfg) return null;
  const customer = idOf(sub.customer), meta = idSchema.safeParse(sub.metadata.companyId);
  const company = await prisma.company.findFirst({
    where: { OR: [...(meta.success ? [{ id: meta.data }] : []), { stripeSubscriptionId: sub.id }, ...(customer ? [{ stripeCustomerId: customer }] : [])] },
    select: { id: true, stripeSubscriptionId: true, stripeCustomerId: true, subscriptionStatus: true },
  });
  if (!company) { log.warn({ subscription: sub.id }, 'subscription of no company'); return null; }
  if (company.stripeSubscriptionId && company.stripeSubscriptionId !== sub.id) {
    // a company keeps one subscription: an older one that ends does not overwrite a newer one, and a second live one
    // (two payments opened at once) is left for the platform to refund
    if (ENDED.has(sub.status)) return company.id;
    if (company.subscriptionStatus && LIVE.has(company.subscriptionStatus)) {
      log.error({ companyId: company.id, kept: company.stripeSubscriptionId, second: sub.id }, 'second live subscription of a company: refund it');
      return company.id;
    }
  }
  const ends = sub.items.data.map((i) => i.current_period_end).filter((x) => Number.isFinite(x));
  await prisma.company.update({
    where: { id: company.id },
    data: {
      stripeSubscriptionId: sub.id, ...(customer && !company.stripeCustomerId ? { stripeCustomerId: customer } : {}),
      subscriptionStatus: sub.status, seatPack: ENDED.has(sub.status) ? 'NONE' : paidPack(sub, cfg.productSeats),
      periodEnd: ends.length ? new Date(Math.max(...ends) * 1000) : null, cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
  await audit({ companyId: company.id, userId: null, action: 'SUBSCRIPTION_UPDATED', entity: 'Company', entityId: company.id, meta: { status: sub.status } });
  await enforceSeats(company.id);
  return company.id;
}
