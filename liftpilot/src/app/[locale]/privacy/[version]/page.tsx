import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { isLocale, type Locale } from '@/i18n/locales';
import { TERMS_HISTORY, TERMS_VERSION, article, dateText } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';

// An earlier version of the privacy notice and the terms of use, word for word as kept in legal/terms/<version>/: a
// company whose owner has not accepted the version in force yet is still bound by one of these (src/lib/legal.ts).
// Kept out of the search engines: the page that counts is /privacy.
const loc = (l: string): Locale => (isLocale(l) ? l : 'it');
const earlier = (v: string) => TERMS_HISTORY.find((h) => h.version === v && h.version !== TERMS_VERSION);

export async function generateMetadata({ params }: { params: Promise<{ locale: string; version: string }> }): Promise<Metadata> {
  const { locale, version } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  const h = earlier(version);
  const title = h ? `${t('title')} — ${t('archiveItem', { label: h.label, date: dateText(locale, h.date) })}` : t('title');
  return pageMetadata({ locale: loc(locale), path: `/privacy/${encodeURIComponent(version)}`, title, description: t('metaDescription'),
    keywords: ['LiftPilot', 'privacy', 'GDPR', 'Data Act', 'Carbon Stealth'], indexable: false });
}

/** The kept text in blocks (the lines between two empty ones): a block of one line is a part's title, else a section's
 *  title and its paragraphs. The first block (the page's title and date) is the heading of this page. */
function blocks(text: string): string[][] {
  return text.split('\n\n').map((b) => b.split('\n').filter((l) => l.trim() !== '')).filter((b) => b.length > 0).slice(1);
}

export default async function ArchivedTermsPage({ params }: { params: Promise<{ locale: string; version: string }> }) {
  const { locale, version } = await params;
  setRequestLocale(locale);
  if (version === TERMS_VERSION) redirect(`/${locale}/privacy`);
  const h = earlier(version);
  if (!h) notFound();
  const text = await readFile(join(process.cwd(), 'legal', 'terms', h.version, `${loc(locale)}.txt`), 'utf8');
  const t = await getTranslations('legal');
  const date = dateText(locale, h.date);
  return (
    <>
      <SiteHeader />
      <main id="main" className="legal">
        <h1>{t('archiveItem', { label: h.label, date })}</h1>
        <p className="lead">{t('archiveLead', { label: h.label, date, changes: article('changes') })}</p>
        <p><Link href="/privacy">{t('archiveCurrent')}</Link></p>
        {blocks(text).map((b, i) =>
          b.length === 1 ? <h2 key={i}>{b[0]}</h2> : (
            <section key={i}>
              <h3>{b[0]}</h3>
              {b.slice(1).map((p, j) => <p key={j}>{p}</p>)}
            </section>
          ),
        )}
      </main>
      <Footer />
    </>
  );
}
