import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { formValuesSchema } from '@/lib/calc-input';
import { verifyStored } from '@/lib/snapshot-hash';
import { ENGINE_VERSION } from '@/calc/snapshot';
import { getCalculation } from '@/server/queries';
import VerdictPill from '@/components/VerdictPill';
import ReviewForm from '@/components/ReviewForm';
import Crumbs from '@/components/Crumbs';
import CalculationView from '@/components/calc/CalculationView';

export async function generateMetadata() {
  const t = await getTranslations('calculations');
  return { title: t('viewTitle') };
}

export default async function CalculationPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:view');
  const c = await getCalculation(user, id);
  if (!c) notFound();
  const values = formValuesSchema.safeParse(c.inputs);
  if (!values.success) notFound();
  const { same } = verifyStored(values.data, c.sha256);
  const [t, tp, tr] = await Promise.all([getTranslations('calculations'), getTranslations('projects'), getTranslations('roles')]);
  const fd = dateFormat(locale);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${c.projectId}`, label: c.project.name }, { label: t('viewTitle') }]} />
      <div className="page-head">
        <div className="titles"><h1>{t('viewTitle')}{c.label ? ` · ${c.label}` : ''}</h1></div>
        <div className="actions">
          {same && can(user.role, 'report:download') ? (
            <a className="btn btn-primary" href={`/api/calculations/${c.id}/relazione?locale=${locale}`}>{t('downloadReport')}</a>
          ) : null}
          {can(user.role, 'calc:create') && !c.project.archivedAt ? (
            <Link className="btn" href={`/app/projects/${c.projectId}/calc?from=${c.id}`}>{t('newFrom')}</Link>
          ) : null}
        </div>
      </div>
      {same ? null : <p className="alert alert-warn">{t('engineChanged', { stored: c.engineVersion, current: ENGINE_VERSION })}</p>}
      <dl className="cartiglio">
        <div><dt>{t('col_result')}</dt><dd><VerdictPill verdict={c.verdict} fails={c.failCount} warns={c.warnCount} /></dd></div>
        <div><dt>{t('col_date')}</dt><dd>{fd.dateTime(c.createdAt)}</dd></div>
        <div><dt>{t('col_author')}</dt><dd>{c.user?.name ?? '—'}</dd></div>
        <div><dt>{t('col_machine')}</dt><dd className="num">{c.summary}</dd></div>
        <div><dt>{t('engine')}</dt><dd className="num">{c.engineVersion} · {c.profileId}</dd></div>
        <div className="wide"><dt>{t('col_hash')}</dt><dd className="hash">{c.sha256}{same ? ` · ${t('hashOk')}` : ''}</dd></div>
      </dl>
      <section className="panel">
        <h2>{t('reviewsTitle')}</h2>
        {c.reviews.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {c.reviews.map((r) => (
              <li key={r.id} className="border-b border-rule pb-2 last:border-b-0">
                <b>{r.user?.name ?? '—'}</b>{r.user ? ` · ${tr(r.user.role)}` : ''} · <span className="note">{fd.dateTime(r.createdAt)}</span>
                {r.note ? <p className="whitespace-pre-line">{r.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : <p className="note">{t('noReviews')}</p>}
        {can(user.role, 'calc:review') ? <ReviewForm calculationId={c.id} /> : null}
      </section>
      <CalculationView values={values.data} brand={user.companyName} />
    </main>
  );
}
