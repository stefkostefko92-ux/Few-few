import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { isLocale, type Locale } from '@/i18n/locales';
import { PROFILO } from '@/calc/norme';
import { publicBaseUrl } from '@/lib/env';
import { breadcrumbLd, faqLd, ldJson, organizationLd, pageMetadata, softwareLd, speakableLd, websiteLd } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';

const FAQ = [1, 2, 3, 4, 5] as const;
const FEATURES = [1, 2, 3, 4] as const;
const STEPS = [1, 2, 3] as const;
const loc = (l: string): Locale => (isLocale(l) ? l : 'it');

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: loc(locale), path: '', title: t('metaTitle'), description: t('metaDescription'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: true });
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');
  const url = `${publicBaseUrl()}/${locale}`;
  const faq = FAQ.map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const ld = ldJson([organizationLd(), websiteLd(loc(locale)), softwareLd(loc(locale), t('metaDescription')),
    breadcrumbLd([{ name: 'Argano', url }]), faqLd(faq), speakableLd(url, ['#answer', '.faq-a'])]);
  return (
    <>
      <SiteHeader />
      <main className="page">
        <section className="flex flex-col gap-3 border-b-2 border-ink pb-6">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('h1')}</h1>
          <p id="answer" className="lead text-[16px]">{t('answer')}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link className="btn btn-primary" href="/login">{t('ctaLogin')}</Link>
            <a className="btn" href="#come-funziona">{t('ctaHow')}</a>
          </div>
          <p className="alert alert-warn max-w-[80ch]">{t('status')}</p>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="cosa-fa">
          <h2 id="cosa-fa">{t('featuresTitle')}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {FEATURES.map((n) => (
              <div key={n} className="panel">
                <h3>{t(`feature${n}Title`)}</h3>
                <p className="text-[14px]">{t(`feature${n}Text`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3" id="come-funziona" aria-labelledby="come-funziona-h">
          <h2 id="come-funziona-h">{t('howTitle')}</h2>
          <ol className="grid gap-3 md:grid-cols-3 list-none p-0 m-0">
            {STEPS.map((n) => (
              <li key={n} className="panel">
                <p className="eyebrow">{t('stepLabel', { n })}</p>
                <h3>{t(`step${n}Title`)}</h3>
                <p className="text-[14px]">{t(`step${n}Text`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="norme">
          <h2 id="norme">{t('normsTitle')}</h2>
          <p className="lead">{t('normsLead')}</p>
          <ul className="panel m-0 list-none">
            {PROFILO.documenti.map((d) => (
              <li key={d.sigla} className="flex flex-col gap-0.5 border-b border-rule py-2 last:border-b-0">
                <b>{d.sigla}</b>
                <span className="note">{d.ambito}</span>
              </li>
            ))}
          </ul>
          <p className="note">{t('normsNote', { profile: PROFILO.id })}</p>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="domande">
          <h2 id="domande">{t('faqTitle')}</h2>
          <div className="flex flex-col gap-3">
            {faq.map((x) => (
              <div key={x.q} className="panel">
                <h3>{x.q}</h3>
                <p className="faq-a text-[14px]">{x.a}</p>
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
