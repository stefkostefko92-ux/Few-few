import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/auth';
import { errorCode, pagePath } from '@/lib/feedback';
import FeedbackForm from '@/components/FeedbackForm';
import '@/app/guide.css';

export async function generateMetadata() {
  const t = await getTranslations('feedback');
  return { title: t('title') };
}

// «Segnala un problema» for every signed-in user, whatever the role and also in a company that is read-only (it writes
// nothing of the company's work). It comes from the menu, from the error page (?codice=<digest>&da=<path>) or from the
// guide: the page and the code are read from the address, checked (path only, a code of letters and digits) and shown.
export default async function SegnalaPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale);
  const sp = await searchParams;
  const page = pagePath(sp.da), digest = errorCode(sp.codice);
  const t = await getTranslations('feedback');
  // the way back: a page of the application other than this one
  const back = page && page.startsWith('/app') && page !== '/app/segnala' ? page : null;
  return (
    <main className="page page-narrow">
      <div className="page-head">
        <div className="titles">
          <h1>{t('title')}</h1>
          <p className="lead">{t('lead')}</p>
        </div>
      </div>
      <FeedbackForm page={page} digest={digest} back={back} />
    </main>
  );
}
