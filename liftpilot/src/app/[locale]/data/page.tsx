import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale, type Locale } from '@/i18n/locales';
import { publicBaseUrl } from '@/lib/env';
import { BACKUP_DAYS, dateText, legalValues } from '@/lib/legal';
import { EXPORT_DATA, EXPORT_ENVELOPE, EXPORT_FORMAT, EXPORT_FORMAT_VERSION, EXPORT_PROJECT, EXPORT_REGISTER_DATE } from '@/lib/export-format';
import { HOSTING, PROVIDER } from '@/lib/provider';
import { SITE_NAME, breadcrumbLd, ldJson, organizationLd, pageMetadata, websiteLd } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';

// The register the Data Act asks of a data processing service (Regulation (EU) 2023/2854): what a company can take with
// it and in which formats, the structure of its JSON export (art. 26(b), kept with src/lib/export-format.ts), how to
// switch, where the servers are and under which law, and what keeps third-country authorities out (art. 28 and 32).
// The terms of use point here (article «exit»).
const loc = (l: string): Locale => (isLocale(l) ? l : 'it');
const FILES = ['reports', 'order', 'drawings', 'company'] as const;
const SECTIONS = ['excluded', 'switch', 'where', 'access', 'contact'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dataPage' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return pageMetadata({ locale: loc(locale), path: '/data', title: t('title'), description: t('metaDescription'),
    keywords: [...t('keywords').split(',').map((k) => k.trim()), ...m('keywords').split(',').slice(0, 2).map((k) => k.trim())], indexable: true });
}

export default async function DataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dataPage');
  const base = publicBaseUrl(), url = `${base}/${locale}/data`;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const ld = ldJson([organizationLd(), websiteLd(loc(locale)), breadcrumbLd([{ name: SITE_NAME, url: `${base}/${locale}` }, { name: t('title'), url }])]);
  const v = { ...legalValues(), backupDays: BACKUP_DAYS, format: EXPORT_FORMAT, version: EXPORT_FORMAT_VERSION, host: HOSTING.provider,
    email: PROVIDER.email, phoneBg: PROVIDER.phones[0], phoneIt: PROVIDER.phones[1] };
  const paras = (s: string) => s.split('\n\n').map((p, i) => <p key={i}>{p}</p>);
  return (
    <>
      <SiteHeader />
      <main className="legal">
        <h1>{t('title')}</h1>
        <p className="note"><time dateTime={EXPORT_REGISTER_DATE}>{t('updated', { date: dateText(locale, EXPORT_REGISTER_DATE) })}</time></p>
        <p className="lead">{t('lead', v)}</p>

        <section aria-labelledby="q-files">
          <h2 id="q-files">{t('filesTitle')}</h2>
          <p>{t('filesText')}</p>
          <div className="table-panel">
            <table className="data-table stack">
              <thead><tr><th>{t('fileWhat')}</th><th>{t('fileFormat')}</th></tr></thead>
              <tbody>
                {FILES.map((k) => <tr key={k}><td className="row-title">{t(`files.${k}.what`)}</td><td data-label={t('fileFormat')}>{t(`files.${k}.format`)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="q-json">
          <h2 id="q-json">{t('jsonTitle')}</h2>
          {paras(t('jsonText', v))}
          <div className="table-panel">
            <table className="data-table stack">
              <thead><tr><th>{t('key')}</th><th>{t('content')}</th></tr></thead>
              <tbody>
                {[...EXPORT_ENVELOPE, ...EXPORT_DATA].map((k) => (
                  <tr key={k}><td className="row-title"><code>{k}</code></td><td data-label={t('content')}>{t(`keys.${k}`, v)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{t('projectText')}</p>
          <ul>{EXPORT_PROJECT.map((k) => <li key={k}><code>{k}</code> — {t(`project.${k}`)}</li>)}</ul>
        </section>

        {SECTIONS.map((k) => (
          <section key={k} aria-labelledby={`q-${k}`}>
            <h2 id={`q-${k}`}>{t(`${k}Title`)}</h2>
            {paras(t(`${k}Text`, v))}
          </section>
        ))}
      </main>
      <Footer />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld }} />
    </>
  );
}
