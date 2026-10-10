'use server';
// The owner's subscription: Checkout for a new one (the monthly price for the owner + the pack of slots, priced from the
// Stripe Price, never from the browser), the pack changed on the live subscription (an upgrade is paid at once or not
// made), and Stripe's portal for the payment method, the invoices and the cancellation. The rights follow only what
// Stripe returns (the webhook and the API, with the server's key). Every refusal comes back to the page as a code.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type Stripe from 'stripe';
import { z } from 'zod';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { PACK } from '@/lib/billing';
import { billingConfig } from '@/lib/billing-config';
import { monthlyPrice, packPriceData, priceOfItem, stripeClient, stripeErrorOf } from '@/lib/stripe';
import { publicBaseUrl } from '@/lib/env';
import { TERMS_VERSION } from '@/lib/legal';
import { rateLimit } from '@/lib/ratelimit';
import { companySubscription, syncSubscription } from './billing';
import { str } from './form';

const packSchema = z.enum(['NONE', 'FIVE', 'TEN', 'UNLIMITED']);
const HOUR = 60 * 60 * 1000;

const localeOf = (fd: FormData): string => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };
const page = (locale: string, q = ''): string => `/${locale}/app/billing${q ? `?${q}` : ''}`;
const idOf = (x: string | { id: string } | null): string | null => (x === null ? null : typeof x === 'string' ? x : x.id);

async function owner(): Promise<SessionUser | null> {
  const me = await getSessionUser();
  return me && !me.mustChangePassword && can(me, 'billing:manage') ? me : null;
}

/** The company's Stripe customer, made once (the id kept before anything is paid). */
async function customerOf(s: Stripe, me: SessionUser, locale: string): Promise<string> {
  const c = await prisma.company.findUnique({ where: { id: me.companyId }, select: { stripeCustomerId: true } });
  if (c?.stripeCustomerId) return c.stripeCustomerId;
  const made = await s.customers.create(
    { name: me.companyName, email: me.email, preferred_locales: [locale], metadata: { companyId: me.companyId } },
    { idempotencyKey: `liftpilot-customer-${me.companyId}` },
  );
  await prisma.company.updateMany({ where: { id: me.companyId, stripeCustomerId: null }, data: { stripeCustomerId: made.id } });
  const kept = await prisma.company.findUnique({ where: { id: me.companyId }, select: { stripeCustomerId: true } });
  return kept?.stripeCustomerId ?? made.id;
}

export async function startCheckoutAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd), me = await owner();
  if (!me) redirect(page(locale, 'e=forbidden'));
  const cfg = billingConfig(), s = stripeClient();
  if (!cfg || !s) redirect(page(locale, 'e=billingOff'));
  if (!rateLimit(`billing:${me.companyId}`, 20, HOUR)) redirect(page(locale, 'e=rateLimited'));
  // a subscription is started or changed under the terms in force only: the owner accepts them first (cancelling stays open)
  if (me.terms !== 'ok') redirect(page(locale, 'e=termsDue'));
  const pack = packSchema.safeParse(str(fd, 'pack'));
  if (!pack.success) redirect(page(locale, 'e=invalid'));
  if (str(fd, 'terms') !== '1') redirect(page(locale, 'e=terms'));
  const sub = await companySubscription(me.companyId);
  if (!sub) redirect(page(locale, 'e=forbidden'));
  if (sub.subscriptionId) redirect(page(locale, 'e=subscribed'));
  if (sub.used > PACK[pack.data].seats) redirect(page(locale, 'e=tooManyMembers'));
  let url: string | null = null, code = 'stripe';
  try {
    const price = await monthlyPrice();
    if (!price) code = 'priceUnavailable';
    else {
      const customer = await customerOf(s, me, locale);
      // one payment open at a time: a second tab would make a second subscription
      const open = await s.checkout.sessions.list({ customer, status: 'open', limit: 10 });
      await Promise.all(open.data.map((x) => s.checkout.sessions.expire(x.id).catch(() => undefined)));
      const seats = packPriceData(pack.data, price, cfg.productSeats);
      const base = publicBaseUrl();
      const session = await s.checkout.sessions.create({
        mode: 'subscription', customer, client_reference_id: me.companyId,
        line_items: [{ price: cfg.priceMonthly, quantity: 1 }, ...(seats ? [{ price_data: seats, quantity: 1 }] : [])],
        subscription_data: { metadata: { companyId: me.companyId, pack: pack.data } },
        billing_address_collection: 'required', tax_id_collection: { enabled: true }, customer_update: { name: 'auto', address: 'auto' },
        automatic_tax: { enabled: cfg.automaticTax }, locale: isLocale(locale) ? locale : 'auto',
        success_url: `${base}${page(locale, 'done=1')}`, cancel_url: `${base}${page(locale)}`,
      });
      url = session.url;
    }
  } catch (err) {
    log.error({ err: stripeErrorOf(err), companyId: me.companyId }, 'checkout not created');
  }
  if (!url) redirect(page(locale, `e=${code}`));
  await audit({ companyId: me.companyId, userId: me.id, action: 'SUBSCRIPTION_CHECKOUT', entity: 'Company', entityId: me.companyId, meta: { pack: pack.data, terms: TERMS_VERSION } });
  redirect(url);
}

export async function changePackAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd), me = await owner();
  if (!me) redirect(page(locale, 'e=forbidden'));
  const cfg = billingConfig(), s = stripeClient();
  if (!cfg || !s) redirect(page(locale, 'e=billingOff'));
  if (!rateLimit(`billing:${me.companyId}`, 20, HOUR)) redirect(page(locale, 'e=rateLimited'));
  if (me.terms !== 'ok') redirect(page(locale, 'e=termsDue'));
  const pack = packSchema.safeParse(str(fd, 'pack'));
  if (!pack.success) redirect(page(locale, 'e=invalid'));
  const sub = await companySubscription(me.companyId);
  if (!sub?.subscriptionId) redirect(page(locale, 'e=noSubscription'));
  if (pack.data === sub.seatPack) redirect(page(locale, 'e=samePack'));
  if (sub.used > PACK[pack.data].seats) redirect(page(locale, 'e=tooManyMembers'));
  let code: string | null = null;
  try {
    const live = await s.subscriptions.retrieve(sub.subscriptionId);
    const seatsLines = live.items.data.filter((i) => idOf(i.price.product) === cfg.productSeats);
    const ownerLine = live.items.data.find((i) => idOf(i.price.product) !== cfg.productSeats);
    const price = ownerLine ? priceOfItem(ownerLine.price) : null;
    if (!price) { code = 'priceUnavailable'; } else {
      const seats = packPriceData(pack.data, price, cfg.productSeats);
      // an upgrade is invoiced for the rest of the period and paid at once, or nothing changes (error_if_incomplete);
      // a downgrade leaves a credit for the next invoices
      const updated = await s.subscriptions.update(live.id, {
        items: [...seatsLines.map((i) => ({ id: i.id, deleted: true })), ...(seats ? [{ price_data: seats, quantity: 1 }] : [])],
        proration_behavior: 'always_invoice', payment_behavior: 'error_if_incomplete',
        metadata: { ...live.metadata, companyId: me.companyId, pack: pack.data },
      });
      await syncSubscription(updated);
      await audit({ companyId: me.companyId, userId: me.id, action: 'SUBSCRIPTION_PACK_CHANGED', entity: 'Company', entityId: me.companyId, meta: { from: sub.seatPack, to: pack.data } });
    }
  } catch (err) {
    const e = stripeErrorOf(err);
    log.warn({ err: e, companyId: me.companyId }, 'pack not changed');
    code = e.type === 'StripeCardError' || e.status === 402 ? 'paymentFailed' : 'stripe';
  }
  revalidatePath(page(locale));
  redirect(page(locale, code ? `e=${code}` : 'changed=1'));
}

export async function portalAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd), me = await owner();
  if (!me) redirect(page(locale, 'e=forbidden'));
  const s = stripeClient();
  if (!s) redirect(page(locale, 'e=billingOff'));
  if (!rateLimit(`billing:${me.companyId}`, 20, HOUR)) redirect(page(locale, 'e=rateLimited'));
  const c = await prisma.company.findUnique({ where: { id: me.companyId }, select: { stripeCustomerId: true } });
  if (!c?.stripeCustomerId) redirect(page(locale, 'e=noCustomer'));
  let url: string | null = null;
  try {
    const p = await s.billingPortal.sessions.create({ customer: c.stripeCustomerId, return_url: `${publicBaseUrl()}${page(locale)}`, locale: isLocale(locale) ? locale : 'auto' });
    url = p.url;
  } catch (err) {
    log.error({ err: stripeErrorOf(err), companyId: me.companyId }, 'portal not opened');
  }
  redirect(url ?? page(locale, 'e=stripe'));
}
