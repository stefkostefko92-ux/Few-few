import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { isLocale, type Locale } from '@/i18n/locales';
import { PROFILO } from '@/calc/norme';
import { publicBaseUrl } from '@/lib/env';
import { SITE_NAME, breadcrumbLd, faqLd, howToLd, ldJson, organizationLd, pageMetadata, softwareLd, speakableLd, websiteLd } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import FeatureIcon, { type FeatureDrawing } from '@/components/FeatureIcon';
import MachineStage from '@/components/machine/MachineStage';
import DrawingShowcase from '@/components/landing/DrawingShowcase';

const FACTS = [1, 2, 3, 4] as const;
const MODULES: ReadonlyArray<readonly [number, FeatureDrawing]> = [[1, 'plan'], [2, 'section'], [3, 'room'], [4, 'check'], [5, 'sim'], [6, 'docs']];
const STEPS = [1, 2, 3, 4, 5] as const;
const OUTPUTS = [1, 2, 3, 4] as const;
const AUDIENCES = [1, 2, 3] as const;
const TRUST: ReadonlyArray<readonly [number, FeatureDrawing]> = [[1, 'shield'], [2, 'local'], [3, 'trace'], [4, 'roles']];
const FAQ = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** Frames of the 3D simulation with the sample data (rendered by the app's pipeline). */
const FRAMES = [
  { key: 'show3dShaft', src: '/img/lp-3d-shaft.webp', set: undefined, w: 400, h: 800, cls: 'tall' },
  { key: 'show3dRoom', src: '/img/lp-3d-room.webp', set: '/img/lp-3d-room-800.webp 800w, /img/lp-3d-room.webp 1280w', w: 1280, h: 860, cls: 'wide' },
  { key: 'show3dCar', src: '/img/lp-3d-car.webp', set: '/img/lp-3d-car-800.webp 800w, /img/lp-3d-car.webp 1280w', w: 1280, h: 860, cls: 'wide' },
] as const;
const loc = (l: string): Locale => (isLocale(l) ? l : 'it');

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: loc(locale), path: '', title: t('metaTitle'), description: t('metaDescription'),
    keywords: m('keywords').split(',').map((k) => k.trim()), indexable: true });
}

// The public page: what LiftPilot is (design software for a lift, and the machine's selection and checks), its modules,
// drawings and 3D frames made by the software itself with sample data, the way from survey to documents, what is
// delivered, for whom, the safeguards, the standards, the questions and a call to register.
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');
  const url = `${publicBaseUrl()}/${locale}`;
  const faq = FAQ.map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
  const steps = STEPS.map((n) => ({ name: t(`step${n}Title`), text: t(`step${n}Text`) }));
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const ld = ldJson([organizationLd(), websiteLd(loc(locale)), softwareLd(loc(locale), t('metaDescription'), MODULES.map(([n]) => t(`m${n}Title`))),
    breadcrumbLd([{ name: SITE_NAME, url }]), howToLd(t('howTitle'), steps), faqLd(faq), speakableLd(url, ['#answer', '.faq-a'])]);
  return (
    <>
      <SiteHeader />
      <main className="landing">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">{t('eyebrow')}</p>
            <h1>{t('h1')}</h1>
            <p id="answer" className="hero-lead">{t('answer')}</p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" href="/register">{t('ctaRegister')}</Link>
              <Link className="btn btn-lg" href="/login">{t('ctaLogin')}</Link>
              <a className="btn btn-lg btn-quiet" href="#funzioni">{t('ctaFeatures')}</a>
            </div>
            <p className="hero-status">{t('status')}</p>
          </div>
          <MachineStage alt={t('machineAlt')} caption={t('machineCaption')} priority sizes="(min-width: 1320px) 740px, (min-width: 1024px) 56vw, 100vw" />
        </section>

        <dl className="facts-strip" aria-label={t('factsLabel')}>
          {FACTS.map((n) => (
            <div key={n}>
              <dt>{t(`f${n}v`)}</dt>
              <dd>{t(`f${n}l`)}</dd>
            </div>
          ))}
        </dl>

        <section className="section" id="funzioni" aria-labelledby="funzioni-h">
          <div className="section-head">
            <h2 id="funzioni-h">{t('modulesTitle')}</h2>
            <p className="lead">{t('modulesLead')}</p>
          </div>
          <ul className="modules">
            {MODULES.map(([n, icon]) => (
              <li key={n} className="module">
                <FeatureIcon name={icon} />
                <h3>{t(`m${n}Title`)}</h3>
                <p>{t(`m${n}Text`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="section" aria-labelledby="disegni">
          <div className="section-head">
            <h2 id="disegni">{t('showTitle')}</h2>
            <p className="lead">{t('showLead')}</p>
          </div>
          <DrawingShowcase />
        </section>

        <section className="section" aria-labelledby="simulazione">
          <div className="section-head">
            <h2 id="simulazione">{t('show3dTitle')}</h2>
            <p className="lead">{t('show3dLead')}</p>
          </div>
          <div className="frames">
            {FRAMES.map((f) => (
              <figure key={f.key} className={`frame ${f.cls}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- static renders with their own sizes, as the poster of the stage */}
                <img src={f.src} srcSet={f.set} sizes={f.cls === 'tall' ? '(min-width: 900px) 22vw, 60vw' : '(min-width: 900px) 39vw, 100vw'} width={f.w} height={f.h}
                  alt={t(f.key)} loading="lazy" decoding="async" />
                <figcaption>{t(f.key)}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="section" id="come-funziona" aria-labelledby="come-funziona-h">
          <div className="section-head">
            <h2 id="come-funziona-h">{t('howTitle')}</h2>
            <p className="lead">{t('howLead')}</p>
          </div>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.name}>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section" aria-labelledby="consegne">
          <div className="section-head">
            <h2 id="consegne">{t('outTitle')}</h2>
            <p className="lead">{t('outLead')}</p>
          </div>
          <ul className="outputs">
            {OUTPUTS.map((n) => (
              <li key={n}>
                <span className="format">{t(`out${n}Format`)}</span>
                <h3>{t(`out${n}Title`)}</h3>
                <p>{t(`out${n}Text`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="section split" aria-labelledby="per-chi">
          <h2 id="per-chi">{t('whoTitle')}</h2>
          <ul className="audiences">
            {AUDIENCES.map((n) => (
              <li key={n}>
                <h3>{t(`who${n}Title`)}</h3>
                <p>{t(`who${n}Text`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="section trust" aria-labelledby="sicurezza">
          <div className="section-head">
            <h2 id="sicurezza">{t('trustTitle')}</h2>
            <p className="lead">{t('trustLead')}</p>
          </div>
          <ul className="trust-list">
            {TRUST.map(([n, icon]) => (
              <li key={n}>
                <FeatureIcon name={icon} />
                <h3>{t(`t${n}Title`)}</h3>
                <p>{t(`t${n}Text`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="section" aria-labelledby="norme">
          <div className="section-head">
            <h2 id="norme">{t('normsTitle')}</h2>
            <p className="lead">{t('normsLead')}</p>
          </div>
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

        <section className="end-cta" aria-labelledby="inizia">
          <div>
            <h2 id="inizia">{t('endTitle')}</h2>
            <p>{t('endText')}</p>
          </div>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" href="/register">{t('ctaRegister')}</Link>
            <Link className="btn btn-lg" href="/login">{t('ctaLogin')}</Link>
          </div>
        </section>
      </main>
      <Footer />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
