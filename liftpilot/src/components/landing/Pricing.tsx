// The landing's plans and prices, after the template's pricing cards, with the real offer: the owner's monthly price
// and the three packs of slots for the colleagues (src/lib/billing.ts), priced from the same Stripe Price the
// subscription and /pricing use. Without Stripe on the server the service is in its free beta and every card says so;
// when Stripe does not answer, the price is "on request". Never a number written here. Monthly only: no yearly switch.
// Server component.
import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { SeatPack } from '@prisma/client';
import { Link } from '@/i18n/routing';
import { PACK, SEAT_PACKS, packAmount } from '@/lib/billing';
import { billingConfig } from '@/lib/billing-config';
import { monthlyPrice, stripeErrorOf, type MonthlyPrice } from '@/lib/stripe';
import { money } from '@/lib/money';
import { log } from '@/lib/log';
import Icon from '@/components/Icon';

// after Stripe failed to answer, the landing says "on request" for a minute before asking again (a public page: not a
// call to Stripe and a warning in the log on every visit); the price itself is cached by monthlyPrice()
const RETRY_MS = 60 * 1000;
let failedAt = 0;

async function currentPrice(): Promise<MonthlyPrice | null> {
  if (Date.now() - failedAt < RETRY_MS) return null;
  try {
    return await monthlyPrice();
  } catch (err) {
    failedAt = Date.now();
    log.warn({ err: stripeErrorOf(err) }, 'monthly price not read for the landing page');
    return null;
  }
}

export default async function Pricing({ locale }: { locale: string }) {
  const [t, tp, tb] = await Promise.all([getTranslations('landing'), getTranslations('pricing'), getTranslations('billing')]);
  const cfg = billingConfig(), price = cfg ? await currentPrice() : null;
  const per = price ? (price.intervalCount === 1 ? tb(`per1.${price.interval}`) : tb('perPeriod', { n: price.intervalCount, unit: tb(`unit.${price.interval}`) })) : '';
  const seatsOf = (p: SeatPack): string => (p === 'NONE' ? tb('ownerOnly') : p === 'UNLIMITED' ? tb('seatsUnlimited') : tb('seatsN', { n: PACK[p].seats }));
  return (
    <section id="prezzi" className="lp-section pricing-section" aria-labelledby="prezzi-h">
      <div className="lp-wrap">
        <div className="pricing-head">
          <p className="eyebrow">{t('priceEyebrow')}</p>
          <h2 id="prezzi-h"><span>{t('priceTitleA')}</span> <em>{t('priceTitleB')}</em></h2>
          <Link className="text-cta" href="/pricing">{t('priceMore')} <Icon name="arrow-right" size={18} /></Link>
        </div>
        <p className="pricing-lead">{tp('packsText')}</p>
        <ul className="pricing-grid">
          {SEAT_PACKS.map((p, k) => (
            <li key={p} className={`price-card${k === 0 ? ' first' : ''}`}>
              <h3 className="plan-name">{tb(`pack.${p}`)}</h3>
              <p className="price">
                {price ? <><strong>{money(price.cents + packAmount(price.cents, p), price.currency, locale)}</strong> <small>{per}</small></>
                  : cfg ? <strong className="word">{tp('onRequest')}</strong>
                    : <><strong className="word">{t('planFree')}</strong> <small>{t('planFreeNote')}</small></>}
              </p>
              <ul>
                <li>{seatsOf(p)}</li>
                <li>{PACK[p].pct ? tp('share', { pct: PACK[p].pct }) : tp('shareNone')}</li>
                <li>{t('planAll')}</li>
              </ul>
              <Link className={`btn btn-block${k === 0 ? ' btn-primary' : ''}`} href="/register">
                {tp('cta')}{k === 0 ? <span className="btn-arrow" aria-hidden="true">→</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        {!cfg ? <p className="pricing-note"><span className="badge accent">{t('betaTag')}</span> {t('betaFree')}</p>
          : price ? <p className="pricing-note">{cfg.trialDays > 0 ? `${t('planTrial', { days: cfg.trialDays })} ` : ''}{tb(`tax.${price.taxBehavior ?? 'unspecified'}`)}</p>
            : null}
      </div>
    </section>
  );
}
