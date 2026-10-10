import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { SeatPack } from '@prisma/client';
import { Link } from '@/i18n/routing';
import { isLocale, type Locale } from '@/i18n/locales';
import { publicBaseUrl } from '@/lib/env';
import { PACK, SEAT_PACKS, packAmount } from '@/lib/billing';
import { billingConfig } from '@/lib/billing-config';
import { monthlyPrice, stripeErrorOf, type MonthlyPrice } from '@/lib/stripe';
import { money } from '@/lib/money';
import { log } from '@/lib/log';
import { PROVIDER } from '@/lib/provider';
import { MIN_TRIAL_DAYS, NOTICE_DAYS } from '@/lib/legal';
import { SITE_NAME, breadcrumbLd, faqLd, ldJson, organizationLd, pageMetadata, softwareLd, websiteLd } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';

// What LiftPilot costs, answer first: the owner's monthly price and the packs of slots as Stripe has them now (the same
// Price the subscription uses, src/lib/stripe.ts), the trial, and the terms of the subscription in short. Without Stripe
// on the server the service is in its free beta; when Stripe does not answer, the price is "on request": never a number
// written here.
const FAQ = [1, 2, 3, 4, 5] as const;
const loc = (l: string): Locale => (isLocale(l) ? l : 'it');

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return pageMetadata({ locale: loc(locale), path: '/pricing', title: t('metaTitle'), description: t('metaDescription'),
    keywords: t('keywords').split(',').map((k) => k.trim()), indexable: true });
}

// after Stripe failed to answer, the page says "on request" for a minute before asking again (a public page: not a
// call to Stripe and a warning in the log on every visit)
const RETRY_MS = 60 * 1000;
let failedAt = 0;

async function currentPrice(): Promise<MonthlyPrice | null> {
  if (Date.now() - failedAt < RETRY_MS) return null;
  try {
    return await monthlyPrice();
  } catch (err) {
    failedAt = Date.now();
    log.warn({ err: stripeErrorOf(err) }, 'monthly price not read for the pricing page');
    return null;
  }
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tb] = await Promise.all([getTranslations('pricing'), getTranslations('billing')]);
  const cfg = billingConfig(), price = cfg ? await currentPrice() : null;
  const base = publicBaseUrl(), url = `${base}/${locale}/pricing`;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const eur = (cents: number): string => (price ? money(cents, price.currency, locale) : '');
  const per = price ? (price.intervalCount === 1 ? tb(`per1.${price.interval}`) : tb('perPeriod', { n: price.intervalCount, unit: tb(`unit.${price.interval}`) })) : '';
  const seatsOf = (p: SeatPack): string => (p === 'NONE' ? tb('ownerOnly') : p === 'UNLIMITED' ? tb('seatsUnlimited') : tb('seatsN', { n: PACK[p].seats }));
  // without Stripe on the server the service is in its free beta (terms, article «subscription»)
  const answer = !cfg ? t('answerBeta', { noticeDays: NOTICE_DAYS })
    : price ? t('answerPrice', { base: eur(price.cents), per, days: cfg.trialDays }) : t('answerOnRequest', { email: PROVIDER.email });
  const faq = FAQ.map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`, { email: PROVIDER.email }) }));
  // the offer goes into the structured data only with the price Stripe gave
  const offers = price ? SEAT_PACKS.map((p) => ({
    '@type': 'Offer', name: `${SITE_NAME} — ${seatsOf(p)}`, price: ((price.cents + packAmount(price.cents, p)) / 100).toFixed(2),
    priceCurrency: price.currency.toUpperCase(), eligibleCustomerType: 'https://schema.org/Business', url,
  })) : [];
  const ld = ldJson([organizationLd(), websiteLd(loc(locale)),
    { ...softwareLd(loc(locale), t('metaDescription')), ...(offers.length ? { offers } : {}) },
    breadcrumbLd([{ name: SITE_NAME, url: `${base}/${locale}` }, { name: t('title'), url }]), faqLd(faq)]);
  return (
    <>
      <SiteHeader />
      <main id="main" className="legal pricing">
        <h1>{t('title')}</h1>
        <p id="answer" className="lead">{answer}</p>
        <section aria-labelledby="q-packs">
          <h2 id="q-packs">{t('packsTitle')}</h2>
          <p>{t('packsText')}</p>
          <div className="table-panel">
            <table className="data-table stack">
              <thead><tr><th>{t('colPack')}</th><th>{t('colShare')}</th><th>{t('colTotal')}</th></tr></thead>
              <tbody>
                {SEAT_PACKS.map((p) => (
                  <tr key={p}>
                    <td className="row-title">{seatsOf(p)}</td>
                    <td data-label={t('colShare')}>{PACK[p].pct ? t('share', { pct: PACK[p].pct }) : t('shareNone')}</td>
                    <td data-label={t('colTotal')} className="num">{price ? `${eur(price.cents + packAmount(price.cents, p))} ${per}` : t(cfg ? 'onRequest' : 'betaFree')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {price ? <p className="note">{tb(`tax.${price.taxBehavior ?? 'unspecified'}`)}</p> : null}
        </section>
        <section aria-labelledby="q-trial">
          <h2 id="q-trial">{t('trialTitle')}</h2>
          <p>{cfg ? t('trialText', { days: cfg.trialDays }) : t('trialBeta', { minTrialDays: MIN_TRIAL_DAYS })}</p>
          <p><Link className="btn btn-primary" href="/register">{t('cta')}</Link></p>
        </section>
        <section aria-labelledby="q-terms">
          <h2 id="q-terms">{t('termsTitle')}</h2>
          <ul>{(['t1', 't2', 't3', 't4', 't7'] as const).map((k) => <li key={k}>{tb(`terms.${k}`)}</li>)}</ul>
          <p className="note">{t.rich('termsNote', { terms: (c) => <Link href="/privacy#terms">{c}</Link>, data: (c) => <Link href="/data">{c}</Link> })}</p>
        </section>
        <section aria-labelledby="q-faq">
          <h2 id="q-faq">{t('faqTitle')}</h2>
          {faq.map((x, i) => (
            <div key={i} className="faq-item">
              <h3>{x.q}</h3>
              <p className="faq-a">{x.a}</p>
            </div>
          ))}
        </section>
      </main>
      <Footer />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
