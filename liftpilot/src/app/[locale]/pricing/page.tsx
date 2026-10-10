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
import Icon, { type IconName } from '@/components/Icon';
import Footer from '@/components/Footer';
import '@/app/public.css';
import '@/app/check-list.css';

// What LiftPilot costs, answer first: the owner's monthly price and the packs of slots as Stripe has them now (the same
// Price the subscription uses, src/lib/stripe.ts), the trial, and the terms of the subscription in short. Without Stripe
// on the server the service is in its free beta; when Stripe does not answer, the price is "on request": never a number
// written here.
const FAQ = [1, 2, 3, 4, 5] as const;
const PLAN_ICON: Record<SeatPack, IconName> = { NONE: 'user', FIVE: 'users', TEN: 'users', UNLIMITED: 'building-2' };
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
  const plan = (p: SeatPack): { value: string; unit: string; line: string } => {
    const share = PACK[p].pct ? t('share', { pct: PACK[p].pct }) : t('planBase');
    if (price) return { value: eur(price.cents + packAmount(price.cents, p)), unit: per, line: share };
    if (cfg) return { value: t('priceOnRequest'), unit: '', line: share };
    return { value: t('priceFree'), unit: t('priceBeta'), line: PACK[p].pct ? t('planAfterBeta', { share }) : t('planBase') };
  };
  return (
    <>
      <SiteHeader />
      <main className="pub-page pricing">
        <header className="pub-head blueprint">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p id="answer" className="lead">{answer}</p>
        </header>
        <section aria-labelledby="q-packs" className="pub-section">
          <div className="pub-section-head">
            <h2 id="q-packs">{t('packsTitle')}</h2>
            <p>{t('packsText')}</p>
          </div>
          <ul className="price-grid" aria-label={t('plansLabel')}>
            {SEAT_PACKS.map((p) => {
              const x = plan(p);
              return (
                <li key={p} className="price-card">
                  <div className="price-card-head">
                    <span className="icon-tile sm"><Icon name={PLAN_ICON[p]} size={18} /></span>
                    <h3>{seatsOf(p)}</h3>
                  </div>
                  <p className="price"><strong className="num">{x.value}</strong>{x.unit ? <small>{x.unit}</small> : null}</p>
                  <p className="price-line">{x.line}</p>
                  {cfg ? <Link className="btn btn-block" href="/register">{t('cta')}</Link> : null}
                </li>
              );
            })}
          </ul>
          {price ? <p className="note">{tb(`tax.${price.taxBehavior ?? 'unspecified'}`)}</p> : null}
          {/* in the beta every plan is free: one call under the cards instead of the same button on each */}
          {!cfg ? <p className="price-cta"><Link className="btn btn-primary" href="/register">{t('cta')}</Link></p> : null}
        </section>
        <div className="pub-split">
          {/* the trial and what every plan holds stacked beside the terms, so the two columns end together */}
          <div className="pub-stack">
            <section aria-labelledby="q-trial" className="panel">
              <div className="panel-head"><span className="icon-tile sm"><Icon name="badge-check" size={18} /></span><h2 id="q-trial">{t('trialTitle')}</h2></div>
              <p>{cfg ? t('trialText', { days: cfg.trialDays }) : t('trialBeta', { minTrialDays: MIN_TRIAL_DAYS })}</p>
              <p className="panel-cta"><Link className={cfg ? 'btn btn-primary' : 'btn'} href="/register">{t('cta')}</Link></p>
            </section>
            <section aria-labelledby="q-included" className="panel included">
              <div className="panel-head"><span className="icon-tile sm"><Icon name="list-checks" size={18} /></span><h2 id="q-included">{t('includedTitle')}</h2></div>
              <ul className="check-list">{(['inc1', 'inc2', 'inc3', 'inc4'] as const).map((k) => <li key={k}>{t(k)}</li>)}</ul>
            </section>
          </div>
          <section aria-labelledby="q-terms" className="panel">
            <div className="panel-head"><span className="icon-tile sm"><Icon name="file-text" size={18} /></span><h2 id="q-terms">{t('termsTitle')}</h2></div>
            <ul className="check-list">{(['t1', 't2', 't3', 't4', 't7'] as const).map((k) => <li key={k}>{tb(`terms.${k}`)}</li>)}</ul>
            <p className="note">{t.rich('termsNote', { terms: (c) => <Link href="/privacy#terms">{c}</Link>, data: (c) => <Link href="/data">{c}</Link> })}</p>
          </section>
        </div>
        <section aria-labelledby="q-faq" className="pub-faq">
          <h2 id="q-faq">{t.rich('faqTitle', { em: (c) => <em>{c}</em> })}</h2>
          <div className="faq-list">
            {faq.map((x, i) => (
              <div key={i} className="faq-row">
                <h3>{x.q}</h3>
                <p>{x.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
