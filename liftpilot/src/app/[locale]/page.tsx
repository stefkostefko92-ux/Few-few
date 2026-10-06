import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { INTL_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { PROFILO } from '@/calc/norme';
import { publicBaseUrl } from '@/lib/env';
import { billingConfigured } from '@/lib/billing-config';
import { makePres } from '@/lib/present/tr';
import { asCalcDict } from '@/components/calc/dict';
import { SITE_NAME, breadcrumbLd, faqLd, howToLd, ldJson, organizationLd, pageMetadata, softwareLd, speakableLd, websiteLd } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import FeatureIcon, { type FeatureDrawing } from '@/components/FeatureIcon';
import Hero from '@/components/landing/Hero';
import Floors, { FLOORS } from '@/components/landing/Floors';
import { LANDING_DRAWINGS } from '@/components/landing/drawings';
import { exampleA, registryCounts, sampleChecks, sampleStop } from '@/components/landing/example';

/** The software's parts, for the application's structured data. */
const FEATURES = [1, 2, 3, 4, 5, 6] as const;
const AUDIENCES: ReadonlyArray<readonly [number, FeatureDrawing]> = [[1, 'room'], [2, 'plan'], [3, 'check']];
const TRUST: ReadonlyArray<readonly [number, FeatureDrawing]> = [[1, 'shield'], [2, 'local'], [3, 'trace'], [4, 'roles']];
const FAQ = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** The faces of the first screen (the title, the text), fetched with the page so the title does not reflow when they
 *  arrive: Plex Sans Condensed has no Cyrillic, the Bulgarian title is in Plex Sans 600 (fonts.css, globals.css). */
const FIRST_SCREEN_FONTS: Record<Locale, readonly string[]> = {
  it: ['plex-sans-condensed-700-latin', 'plex-sans-400-latin'],
  en: ['plex-sans-condensed-700-latin', 'plex-sans-400-latin'],
  bg: ['plex-sans-600-cyrillic', 'plex-sans-400-cyrillic', 'plex-sans-400-latin'],
};
const loc = (l: string): Locale => (isLocale(l) ? l : 'it');

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: loc(locale), path: '', title: t('metaTitle'), description: t('metaDescription'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: true });
}

// The public page as a cyanotype drawing sheet: the hero with the live machine of example A and three of its checks as
// the engine computes them on this request; the way from the survey to the documents as the floors of a building, each
// with what the software makes there for the sample installation; who it is for and the safeguards, the standards, the
// questions, and the call to register back on the blue sheet, beside section A-A of the sample shaft in white linework.
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');
  const intl = INTL_LOCALE[loc(locale)], P = makePres(asCalcDict((await getMessages()).calc), intl);
  const url = `${publicBaseUrl()}/${locale}`;
  const faq = FAQ.map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
  const steps = FLOORS.map((_, n) => ({ name: t(`fl${n}H`), text: t(`fl${n}T`) }));
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const ld = ldJson([organizationLd(), websiteLd(loc(locale)), softwareLd(loc(locale), t('metaDescription'), FEATURES.map((n) => t(`m${n}Title`))),
    breadcrumbLd([{ name: SITE_NAME, url }]), howToLd(t('floorsLabel'), steps), faqLd(faq), speakableLd(url, ['#answer', '.faq-a'])]);
  const section = LANDING_DRAWINGS['lp-section'];
  return (
    <>
      {/* React hoists these into the head */}
      {FIRST_SCREEN_FONTS[loc(locale)].map((f) => <link key={f} rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href={`/fonts/${f}.woff2`} />)}
      <SiteHeader />
      <main className="lp">
        <Hero example={exampleA(P)} counts={registryCounts()} beta={!billingConfigured()} />
        <Floors sample={sampleChecks(P)} stop={sampleStop()} intlLocale={intl} />

        <div className="lp-band">
          <div className="lp-wrap lp-two">
            <section aria-labelledby="per-chi">
              <h2 id="per-chi">{t('whoTitle')}</h2>
              <ul className="lp-list">
                {AUDIENCES.map(([n, icon]) => (
                  <li key={n}>
                    <FeatureIcon name={icon} />
                    <h3>{t(`who${n}Title`)}</h3>
                    <p>{t(`who${n}Text`)}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="sicurezza">
              <h2 id="sicurezza">{t('trustTitle')}</h2>
              <ul className="lp-list">
                {TRUST.map(([n, icon]) => (
                  <li key={n}>
                    <FeatureIcon name={icon} />
                    <h3>{t(`t${n}Title`)}</h3>
                    <p>{t(`t${n}Text`)}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <section className="lp-band" aria-labelledby="norme">
          <div className="lp-wrap">
            <h2 id="norme">{t('normsTitle')}</h2>
            <p className="lp-band-lead">{t('normsLead')}</p>
            <div className="lp-norms" role="region" aria-labelledby="norme" tabIndex={0}>
              <table>
                <thead><tr><th scope="col">{t('normsDoc')}</th><th scope="col">{t('normsScope')}</th></tr></thead>
                <tbody>
                  {PROFILO.documenti.map((d) => <tr key={d.sigla}><td>{d.sigla}</td><td>{d.ambito}</td></tr>)}
                </tbody>
              </table>
            </div>
            <p className="lp-norms-note">{t('normsNote', { profile: PROFILO.id })}</p>
          </div>
        </section>

        <section className="lp-band" aria-labelledby="domande">
          <div className="lp-wrap">
            <h2 id="domande">{t('faqTitle')}</h2>
            <div className="lp-faq">
              {faq.map((x) => (
                <div key={x.q}>
                  <h3>{x.q}</h3>
                  <p className="faq-a">{x.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-end lp-sheetband" aria-labelledby="inizia">
          <div className="lp-wrap lp-end-grid">
            <div className="lp-end-copy">
              <h2 id="inizia">{t('endTitle')}</h2>
              <p>{t('endText')}</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn-call" href="/register">{t('ctaRegister')}</Link>
                <Link className="lp-btn lp-btn-line" href="/login">{t('ctaLogin')}</Link>
                <Link className="lp-btn lp-btn-line" href="/pricing">{t('ctaPricing')}</Link>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- the vector section of the sample shaft (scripts/landing-drawings.ts), drawn again as linework on the blue */}
            <img className="lp-end-drawing" src="/img/lp-section.svg" width={section.w} height={section.h} alt="" loading="lazy" decoding="async" />
          </div>
        </section>
      </main>
      <Footer />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
