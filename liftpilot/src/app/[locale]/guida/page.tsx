import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { isLocale, type Locale } from '@/i18n/locales';
import { publicBaseUrl } from '@/lib/env';
import { PROVIDER } from '@/lib/provider';
import { MEMBER_ROLES } from '@/lib/rbac';
import { SITE_NAME, breadcrumbLd, howToLd, ldJson, organizationLd, pageMetadata, websiteLd } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Icon, { type IconName } from '@/components/Icon';
import Footer from '@/components/Footer';
import '@/app/public.css';
import '@/app/check-list.css';
import '@/app/guide.css';

/** The steps of the work, in the order the application takes them (the installation's steps: Rilievo, Calcolo argano,
 *  Progetto, Documenti e ordini), each a question with its answer (messages: guide.<step>). */
const STEPS = [
  { key: 'azienda', icon: 'users' },
  { key: 'rilievi', icon: 'clipboard-list' },
  { key: 'impianti', icon: 'layout-dashboard' },
  { key: 'calcolo', icon: 'calculator' },
  { key: 'progetto', icon: 'drafting-compass' },
  { key: 'documenti', icon: 'file-pdf' },
] as const satisfies readonly { key: string; icon: IconName }[];
const PARAGRAPHS = { azienda: ['a', 'b'], rilievi: ['a', 'b', 'c'], impianti: ['a', 'b'], calcolo: ['a'], progetto: ['a', 'b'], documenti: ['a', 'b'] } as const;
const INTERVENTI = ['SOLO_ARGANO', 'AMMODERNAMENTO', 'TRASFORMAZIONE_COMPLETA'] as const;
const loc = (l: string): Locale => (isLocale(l) ? l : 'it');

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'guide' });
  return pageMetadata({ locale: loc(locale), path: '/guida', title: t('metaTitle'), description: t('metaDescription'),
    keywords: t('keywords').split(',').map((k) => k.trim()), indexable: true });
}

// «Guida rapida» (round 48): the real flow with the words of the interface, read from its messages — the company and the
// colleagues (the roles' notes are those of the team page), the survey sheet and the suppliers' modules, the installation,
// the «Calcolo argano» (the three types of intervention with the leads of their choice), the Progetto, the documents —,
// then what stays with the engineer who signs and where to report a problem. Each part a question (AEO) whose first
// sentence answers it; one H1; the structured data: the provider, the site, the path and the steps (HowTo).
export default async function GuidaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tr, tt, tc] = await Promise.all([getTranslations('guide'), getTranslations('roles'), getTranslations('team'),
    getTranslations('calculations.intervento')]);
  const base = publicBaseUrl(), url = `${base}/${locale}/guida`;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const ld = ldJson([organizationLd(), websiteLd(loc(locale)),
    breadcrumbLd([{ name: SITE_NAME, url: `${base}/${locale}` }, { name: t('eyebrow'), url }]),
    howToLd(t('howTo'), STEPS.map((s) => ({ name: t(`${s.key}.name`), text: t(`${s.key}.a`) })))]);
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="pub-page guide">
        <header className="pub-head blueprint">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p id="answer" className="lead">{t('lead')}</p>
        </header>
        <nav className="panel guide-toc" aria-label={t('tocLabel')}>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.key}><a href={`#${s.key}`}><span className="guide-num" aria-hidden="true">{i + 1}</span>{t(`${s.key}.name`)}</a></li>
            ))}
            <li><a href="#tecnico"><span className="guide-num" aria-hidden="true">✓</span>{t('tecnico.q')}</a></li>
          </ol>
        </nav>
        <ol className="guide-steps">
          {STEPS.map((s, i) => (
            <li key={s.key} id={s.key} className="guide-step">
              <span className="guide-num" aria-hidden="true">{i + 1}</span>
              <h2>{t(`${s.key}.q`)}</h2>
              <div className="guide-body">
                {PARAGRAPHS[s.key].map((p) => <p key={p}>{t(`${s.key}.${p}`)}</p>)}
                {s.key === 'azienda' ? (
                  <>
                    <p>{t('azienda.roles')}</p>
                    <dl className="guide-terms">
                      {MEMBER_ROLES.map((r) => (
                        <div key={r}><dt>{tr(r)}</dt><dd>{tt(`roleNote.${r}` as 'roleNote.ENGINEER')}</dd></div>
                      ))}
                    </dl>
                  </>
                ) : null}
                {s.key === 'calcolo' ? (
                  <>
                    <dl className="guide-terms">
                      {INTERVENTI.map((k) => <div key={k}><dt>{tc(k)}</dt><dd>{tc(`${k}_lead`)}</dd></div>)}
                    </dl>
                    <p>{t('calcolo.b')}</p>
                    <p>{t('calcolo.c')}</p>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <section id="tecnico" aria-labelledby="q-tecnico" className="panel guide-step">
          <span className="guide-num" aria-hidden="true">✓</span>
          <h2 id="q-tecnico">{t('tecnico.q')}</h2>
          <div className="guide-body">
            <p>{t('tecnico.a')}</p>
            <dl className="guide-terms">
              {(['draft', 'brake', 'lista'] as const).map((k) => <div key={k}><dt>{t(`tecnico.${k}T`)}</dt><dd>{t(`tecnico.${k}`)}</dd></div>)}
            </dl>
          </div>
        </section>
        <section id="segnala" aria-labelledby="q-segnala" className="pub-section">
          <div className="pub-section-head">
            <h2 id="q-segnala">{t('segnala.q')}</h2>
            <p>{t('segnala.a', { email: PROVIDER.email })}</p>
          </div>
          <p className="guide-cta">
            <Link className="btn" href="/app/segnala"><Icon name="message-circle" size={18} />{t('segnala.button')}</Link>
            <Link className="btn btn-primary" href="/register">{t('segnala.register')}</Link>
          </p>
        </section>
      </main>
      <Footer />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
