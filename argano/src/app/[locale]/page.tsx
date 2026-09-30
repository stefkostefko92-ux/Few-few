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
import FeatureIcon, { type FeatureDrawing } from '@/components/FeatureIcon';
import MachineStage from '@/components/machine/MachineStage';

const FAQ = [1, 2, 3, 4, 5] as const;
const FEATURES: ReadonlyArray<readonly [number, FeatureDrawing]> = [[1, 'check'], [2, 'proposal'], [3, 'report'], [4, 'trace']];
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
      <main className="landing">
        <section className="hero">
          <div className="hero-copy">
            <h1>{t('h1')}</h1>
            <p id="answer" className="hero-lead">{t('answer')}</p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" href="/login">{t('ctaLogin')}</Link>
              <a className="btn btn-lg" href="#come-funziona">{t('ctaHow')}</a>
            </div>
            <p className="hero-status">{t('status')}</p>
          </div>
          <MachineStage alt={t('machineAlt')} caption={t('machineCaption')} priority sizes="(min-width: 1320px) 740px, (min-width: 1024px) 56vw, 100vw" />
        </section>

        <section className="section" aria-labelledby="cosa-fa">
          <h2 id="cosa-fa">{t('featuresTitle')}</h2>
          <dl className="features">
            {FEATURES.map(([n, icon]) => (
              <div key={n} className="feature">
                <FeatureIcon name={icon} />
                <dt>{t(`feature${n}Title`)}</dt>
                <dd>{t(`feature${n}Text`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="section" id="come-funziona" aria-labelledby="come-funziona-h">
          <h2 id="come-funziona-h">{t('howTitle')}</h2>
          <ol className="steps">
            {STEPS.map((n) => (
              <li key={n}>
                <h3>{t(`step${n}Title`)}</h3>
                <p>{t(`step${n}Text`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section" aria-labelledby="norme">
          <h2 id="norme">{t('normsTitle')}</h2>
          <p className="lead">{t('normsLead')}</p>
          <div className="registry-wrap">
            <table className="registry">
              <thead><tr><th scope="col">{t('normsDoc')}</th><th scope="col">{t('normsScope')}</th></tr></thead>
              <tbody>
                {PROFILO.documenti.map((d) => <tr key={d.sigla}><td>{d.sigla}</td><td>{d.ambito}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="note">{t('normsNote', { profile: PROFILO.id })}</p>
        </section>

        <section className="section" aria-labelledby="domande">
          <h2 id="domande">{t('faqTitle')}</h2>
          <div className="faq">
            {faq.map((x) => (
              <div key={x.q} className="faq-item">
                <h3>{x.q}</h3>
                <p className="faq-a">{x.a}</p>
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
