import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { dateFormat } from '@/lib/dates';
import { FEEDBACK_PAGE, feedbackFilter } from '@/lib/feedback';
import { listFeedback } from '@/server/feedback';
import { setFeedbackHandledAction } from '@/server/feedback-actions';
import AccountHead from '@/components/AccountHead';
import Icon from '@/components/Icon';
import '@/app/dashboard.css';
import '@/app/guide.css';

export async function generateMetadata() {
  const t = await getTranslations('feedback.admin');
  return { title: t('title') };
}

const KIND_TONE = { BUG: 'fail', IDEA: 'info', QUESTION: 'warn' } as const;

// The platform's reports («Segnala un problema»), behind the same gate as /app/admin: newest first, those still to handle
// by default (?stato=tutte shows all), each with its company, the person (or that the account is gone), its type, the
// page and the error's code, the text as written (React escapes it; the lines kept as typed) and «Segna come gestita» /
// «Riapri». The text is shown only here: the e-mail to the administrators never carries it.
export default async function SegnalazioniPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireCapability(locale, 'platform:admin');
  const filter = feedbackFilter((await searchParams).stato);
  const [t, tf, tn, rows, lang] = await Promise.all([getTranslations('feedback.admin'), getTranslations('feedback'), getTranslations('nav'), listFeedback(filter),
    getLocale()]);
  const fd = dateFormat(locale);
  return (
    <main className="page">
      <AccountHead area="platform" title={t('title')} lead={t('lead')}
        actions={<Link className="btn" href="/app/admin"><Icon name="arrow-left" size={18} />{tn('admin')}</Link>} />
      <nav className="dash-filters" aria-label={t('filterLabel')}>
        <Link href="/app/admin/segnalazioni" aria-current={filter === 'open' ? 'page' : undefined}>{t('filterOpen')}</Link>
        <Link href="/app/admin/segnalazioni?stato=tutte" aria-current={filter === 'all' ? 'page' : undefined}>{t('filterAll')}</Link>
      </nav>
      {rows.length === 0 ? <p className="panel m-0">{filter === 'open' ? t('emptyOpen') : t('emptyAll')}</p> : (
        <ol className="flex flex-col gap-4 m-0 p-0 list-none" aria-label={t('title')}>
          {rows.map((r) => (
            <li key={r.id} className="panel flex flex-col gap-3" data-feedback={r.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`pill ${KIND_TONE[r.kind]}`}>{tf(`kinds.${r.kind}`)}</span>
                <span className={`status-pill ${r.handledAt ? 'ok' : 'warn'}`}>{r.handledAt ? t('handled', { date: fd.date(r.handledAt) }) : t('open')}</span>
                <span className="note mono">{fd.stamp(r.createdAt)}</span>
              </div>
              <dl className="feedback-meta">
                <div><dt>{t('company')}</dt><dd>{r.company.name}</dd></div>
                <div><dt>{t('user')}</dt><dd>{r.user ? `${r.user.name} · ${r.user.email}` : t('deletedUser')}</dd></div>
                <div><dt>{t('page')}</dt><dd className="mono">{r.page}</dd></div>
                {r.digest ? <div><dt>{t('code')}</dt><dd className="mono">{r.digest}</dd></div> : null}
              </dl>
              <p className="feedback-text">{r.message}</p>
              <form action={setFeedbackHandledAction}>
                <input type="hidden" name="locale" value={lang} />
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="handled" value={r.handledAt ? '0' : '1'} />
                <button type="submit" className={r.handledAt ? 'btn btn-sm' : 'btn btn-sm btn-primary'}>
                  <Icon name={r.handledAt ? 'refresh-cw' : 'check'} size={16} />{r.handledAt ? t('reopen') : t('markHandled')}
                </button>
              </form>
            </li>
          ))}
        </ol>
      )}
      {rows.length === FEEDBACK_PAGE ? <p className="note">{t('limit', { n: FEEDBACK_PAGE })}</p> : null}
    </main>
  );
}
