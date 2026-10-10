import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { INTL_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { PROFILO } from '@/calc/norme';
import { publicBaseUrl } from '@/lib/env';
import { billingConfigured } from '@/lib/billing-config';
import { makePres } from '@/lib/present/tr';
import { asCalcDict } from '@/components/calc/dict';
import { SCENARIOS } from '@/components/lift/scenarios';
import { SITE_NAME, breadcrumbLd, faqLd, howToLd, ldJson, organizationLd, pageMetadata, softwareLd, speakableLd, websiteLd } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import Hero, { HERO_IMG } from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import Showcase from '@/components/landing/Showcase';
import Pricing from '@/components/landing/Pricing';
import Norms from '@/components/landing/Norms';
import Faq from '@/components/landing/Faq';
import Closing from '@/components/landing/Closing';
import { registryCounts, sampleChecks, sampleStop } from '@/components/landing/example';

/** The software's parts for the application's structured data: the four feature cards the page shows (Features.tsx). */
const FEATURES = [1, 2, 3, 4] as const;
const FAQ = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** The faces of the first screen (the title at 800, the text at 400, the header, buttons and labels at 700, the mono
 *  eyebrow and bottom line), fetched with the page so the first layout already has them: every face that arrives later
 *  reshapes and lays out the text again after the first paint (Manrope and DM Mono, fonts.css; the Bulgarian page needs
 *  the Cyrillic subsets, and its mono lines are IBM Plex Mono). */
const FIRST_SCREEN_FONTS: Record<Locale, readonly string[]> = {
  it: ['manrope-800-latin', 'manrope-400-latin', 'manrope-700-latin', 'dm-mono-400-latin'],
  en: ['manrope-800-latin', 'manrope-400-latin', 'manrope-700-latin', 'dm-mono-400-latin'],
  // the Bulgarian first screen sets its languages (IT EN BG) in DM Mono's Latin and the tiles' figures in Manrope 800's
  // Latin: fetched with the page too, or each arrives after the first paint and lays the hero out again (main-thread time)
  bg: ['manrope-800-cyrillic', 'manrope-400-cyrillic', 'manrope-400-latin', 'manrope-700-cyrillic', 'manrope-700-latin', 'plex-mono-400-cyrillic',
    'dm-mono-400-latin', 'manrope-800-latin'],
};
const loc = (l: string): Locale => (isLocale(l) ? l : 'it');

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: loc(locale), path: '', title: t('metaTitle'), description: t('metaDescription'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: true });
}

// The public page after the LiftPilot Premium template (index.html of the pack), section by section with LiftPilot's
// own content: the hero with the cutaway illustration, the four things the software does, the product frame with what
// it made for the sample installation (computed by the engines on this request), the real plans and prices, the
// standards, the questions and the closing call. The steps from the survey to the documents (the showcase's tabs) are
// the HowTo of the structured data.
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');
  const intl = INTL_LOCALE[loc(locale)], P = makePres(asCalcDict((await getMessages()).calc), intl);
  const url = `${publicBaseUrl()}/${locale}`;
  const faq = FAQ.map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
  const steps = [0, 1, 2, 3, 4].map((n) => ({ name: t(`fl${n}H`), text: t(`fl${n}T`) }));
  const sample = sampleChecks(P);
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const ld = ldJson([organizationLd(), websiteLd(loc(locale)), softwareLd(loc(locale), t('metaDescription'), FEATURES.map((n) => t(`feat${n}T`))),
    breadcrumbLd([{ name: SITE_NAME, url }]), howToLd(t('floorsLabel'), steps), faqLd(faq), speakableLd(url, ['#answer', '.faq-a'])]);
  return (
    <>
      {/* React hoists these into the head: the title's faces and the hero's illustration (the LCP) */}
      {FIRST_SCREEN_FONTS[loc(locale)].map((f) => <link key={f} rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href={`/fonts/${f}.woff2`} />)}
      <link rel="preload" as="image" type="image/avif" media={HERO_IMG.wide} imageSrcSet={HERO_IMG.avif} imageSizes={HERO_IMG.sizes} fetchPriority="high" />
      <link rel="preload" as="image" type="image/avif" media={HERO_IMG.phone} imageSrcSet={HERO_IMG.phoneAvif} fetchPriority="high" />
      <SiteHeader at="home" />
      <main id="main" tabIndex={-1} className="lp">
        <Hero counts={registryCounts()} scenarios={SCENARIOS.length} beta={!billingConfigured()} profile={PROFILO.id} engine={sample.engine} />
        <Features />
        <Showcase sample={sample} stop={sampleStop()} intlLocale={intl} />
        <Pricing locale={locale} />
        <Norms />
        <Faq items={faq} />
        <Closing />
      </main>
      <Footer />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
