import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { SeatPack } from '@prisma/client';
import { requireCapability } from '@/lib/auth';
import { PACK, SEAT_PACKS, packAmount } from '@/lib/billing';
import { billingConfig } from '@/lib/billing-config';
import { monthlyPrice, stripeErrorOf, subscriptionPrice, type MonthlyPrice } from '@/lib/stripe';
import { dateFormat } from '@/lib/dates';
import { log } from '@/lib/log';
import { money } from '@/lib/money';
import { companySubscription } from '@/server/billing';
import { changePackAction, portalAction, startCheckoutAction } from '@/server/billing-actions';
import { Link } from '@/i18n/routing';
import AccountHead, { PanelHead } from '@/components/AccountHead';
import '@/app/check-list.css';

export async function generateMetadata() {
  const t = await getTranslations('billing');
  return { title: t('title') };
}

const ERRORS = ['forbidden', 'billingOff', 'rateLimited', 'invalid', 'terms', 'termsDue', 'subscribed', 'tooManyMembers', 'priceUnavailable', 'stripe',
  'noSubscription', 'samePack', 'paymentFailed', 'noCustomer'] as const;
type BillingError = (typeof ERRORS)[number];
const isError = (x: unknown): x is BillingError => typeof x === 'string' && (ERRORS as readonly string[]).includes(x);

// The owner's subscription: its state, the slots used, the price from Stripe for every pack, and the payment.
export default async function BillingPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'billing:manage');
  const [q, t, sub] = await Promise.all([searchParams, getTranslations('billing'), companySubscription(me.companyId)]);
  if (!sub) notFound();
  const cfg = billingConfig(), on = cfg !== null;
  let price: MonthlyPrice | null = null;
  if (cfg) {
    // a live subscription's packs are priced on what it pays for the owner; a new one on today's Price
    try { price = sub.subscriptionId ? await subscriptionPrice(sub.subscriptionId, cfg.productSeats) : await monthlyPrice(); } catch (err) {
      log.warn({ err: stripeErrorOf(err) }, 'monthly price not read');
    }
  }
  const fd = dateFormat(locale), err = isError(q.e) ? q.e : null;
  const eur = (cents: number): string => (price ? money(cents, price.currency, locale) : '—');
  const per = price ? (price.intervalCount === 1 ? t(`per1.${price.interval}`) : t('perPeriod', { n: price.intervalCount, unit: t(`unit.${price.interval}`) })) : '';
  const seatsOf = (p: SeatPack): string => (p === 'NONE' ? t('ownerOnly') : Number.isFinite(PACK[p].seats) ? t('seatsN', { n: PACK[p].seats }) : t('seatsUnlimited'));
  const status = ((): { pill: string; text: string } => {
    switch (sub.access) {
      case 'free': return { pill: 'info', text: on ? t('exempt') : t('off') };
      case 'trial': return { pill: 'info', text: t('trial', { date: sub.trialEndsAt ? fd.date(sub.trialEndsAt) : '—', days: sub.trialDays }) };
      case 'active': return { pill: 'ok', text: sub.periodEnd ? t(sub.cancelAtPeriodEnd ? 'endsOn' : 'renewsOn', { date: fd.date(sub.periodEnd) }) : t('activeNoDate') };
      case 'grace': return { pill: 'warn', text: t('grace') };
      default: return { pill: 'fail', text: t('readonly') };
    }
  })();
  const live = sub.subscriptionId !== null;
  const packChoice = (current: SeatPack | null) => (
    <div className="app-modules">
      {SEAT_PACKS.map((p) => {
        const tooSmall = sub.used > PACK[p].seats;
        return (
          <label key={p} className="app-module">
            <input type="radio" name="pack" value={p} defaultChecked={p === (current ?? 'NONE')} disabled={tooSmall} required />
            <span className="eyebrow">{t(`pack.${p}`)}{p === current ? ` · ${t('current')}` : ''}</span>
            <strong>{price ? `${eur(price.cents + packAmount(price.cents, p))} ${per}` : '—'}</strong>
            <span className="note">{seatsOf(p)}{PACK[p].pct ? ` · ${t('packShare', { pct: PACK[p].pct, amount: eur(packAmount(price?.cents ?? 0, p)) })}` : ''}</span>
            {tooSmall ? <span className="note">{t('tooSmall', { used: sub.used })}</span> : null}
          </label>
        );
      })}
    </div>
  );
  return (
    <main className="page">
      <AccountHead area="company" title={t('title')} lead={t('lead')} />
      {q.done === '1' ? <p className="alert alert-ok" role="status">{t('done')}</p> : null}
      {q.changed === '1' ? <p className="alert alert-ok" role="status">{t('changed')}</p> : null}
      {err ? <p className="alert alert-bad" role="alert">{t(`e.${err}`)}</p> : null}
      <section className="panel" aria-labelledby="status-h">
        <PanelHead icon="badge-check" id="status-h">{t('statusTitle')}</PanelHead>
        <p><span className={`status-pill ${status.pill}`}>{t(`access.${sub.access}`)}</span></p>
        <p>{status.text}</p>
        <p className="note">{t('seatsUsed', { used: sub.used, limit: Number.isFinite(sub.limit) ? String(sub.limit) : '∞' })}</p>
      </section>
      {on ? (
        <section className="panel" aria-labelledby="sub-h">
          <PanelHead icon="layers" id="sub-h">{live ? t('changeTitle') : t('subscribeTitle')}</PanelHead>
          {me.terms !== 'ok' ? (
            <p className="alert alert-warn">{t('e.termsDue')} <Link href="/app/terms">{t('termsAction')}</Link></p>
          ) : price ? (
            <>
              <p className="note">{t('priceNote', { base: `${eur(price.cents)} ${per}` })} {t(`tax.${price.taxBehavior ?? 'unspecified'}`)}</p>
              {live ? (
                <form action={changePackAction} className="flex flex-col gap-3">
                  <input type="hidden" name="locale" value={locale} />
                  {packChoice(sub.seatPack)}
                  <p className="note">{t('changeNote')}</p>
                  <div><button type="submit" className="btn btn-primary">{t('change')}</button></div>
                </form>
              ) : (
                <form action={startCheckoutAction} className="flex flex-col gap-3">
                  <input type="hidden" name="locale" value={locale} />
                  {packChoice(null)}
                  <label className="check consent">
                    <input type="checkbox" name="terms" value="1" required />
                    <span>{t.rich('accept', { terms: (c) => <a href={`/${locale}/privacy#terms`} target="_blank" rel="noopener">{c}</a> })}</span>
                  </label>
                  <div><button type="submit" className="btn btn-primary">{t('subscribe')}</button></div>
                </form>
              )}
            </>
          ) : <p className="alert alert-warn">{t('e.priceUnavailable')}</p>}
          {sub.customerId ? (
            <form action={portalAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" className="btn">{t('portal')}</button>
              <span className="note">{t('portalNote')}</span>
            </form>
          ) : null}
        </section>
      ) : null}
      <section className="panel" aria-labelledby="bterms-h">
        <PanelHead icon="file-text" id="bterms-h">{t('termsTitle')}</PanelHead>
        <ul className="check-list">
          {(['t1', 't2', 't3', 't7', 't4', 't5', 't6'] as const).map((k) => <li key={k}>{t(`terms.${k}`)}</li>)}
        </ul>
      </section>
    </main>
  );
}
