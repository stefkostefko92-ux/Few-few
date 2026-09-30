import { notFound } from 'next/navigation';
import { getFormatter, getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { getProject, listCalculations } from '@/server/queries';
import { setProjectArchivedAction } from '@/server/project-actions';
import VerdictPill from '@/components/VerdictPill';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('projects');
  return { title: `${t('project')} ${(await params).id.slice(-6)}` };
}

export default async function ProjectPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const p = await getProject(user, id);
  if (!p) notFound();
  const [t, tc, format, calcs, lang] = await Promise.all([getTranslations('projects'), getTranslations('calculations'), getFormatter(), listCalculations(user, p.id), getLocale()]);
  const place = [p.address, p.city, p.province].filter(Boolean).join(', ');
  const editable = can(user.role, 'projects:edit') && !p.archivedAt;
  return (
    <main className="page">
      <p className="note"><Link href="/app">← {t('title')}</Link></p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">{t('project')}{p.archivedAt ? ` · ${t('archived')}` : ''}</p>
          <h1>{p.name}</h1>
          {place ? <p className="lead">{place}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? <Link className="btn btn-primary" href={`/app/projects/${p.id}/calc`}>{tc('new')}</Link> : null}
          {editable ? <Link className="btn" href={`/app/projects/${p.id}/edit`}>{t('edit')}</Link> : null}
          {can(user.role, 'projects:archive') ? (
            <form action={setProjectArchivedAction}>
              <input type="hidden" name="locale" value={lang} />
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="archive" value={p.archivedAt ? '0' : '1'} />
              <button type="submit" className="btn">{p.archivedAt ? t('restore') : t('archive')}</button>
            </form>
          ) : null}
        </div>
      </div>

      <dl className="panel meta-grid m-0">
        <div><dt>{t('field_plantNumber')}</dt><dd className="mono">{p.plantNumber ?? '—'}</dd></div>
        <div><dt>{t('field_client')}</dt><dd>{p.client ?? '—'}</dd></div>
        <div><dt>{t('createdBy')}</dt><dd>{p.createdBy?.name ?? '—'} · {format.dateTime(p.createdAt, { dateStyle: 'medium' })}</dd></div>
        <div><dt>{t('updated')}</dt><dd>{format.dateTime(p.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
        {p.notes ? <div className="col-span-full"><dt>{t('field_notes')}</dt><dd className="whitespace-pre-line">{p.notes}</dd></div> : null}
      </dl>

      <section className="flex flex-col gap-3">
        <h2>{tc('title')}</h2>
        {calcs.length === 0 ? (
          <div className="panel"><p>{tc('empty')}</p></div>
        ) : (
          <div className="panel overflow-x-auto p-0">
            <table className="data-table">
              <thead>
                <tr><th>{tc('col_date')}</th><th>{tc('col_result')}</th><th>{tc('col_machine')}</th><th>{tc('col_author')}</th><th>{tc('col_hash')}</th></tr>
              </thead>
              <tbody>
                {calcs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/app/calculations/${c.id}`} className="font-semibold">{format.dateTime(c.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</Link>
                      {c.label ? <div className="note">{c.label}</div> : null}
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <VerdictPill verdict={c.verdict} fails={c.failCount} warns={c.warnCount} />
                        {c._count.reviews ? <span className="note">{tc('reviewed', { n: c._count.reviews })}</span> : null}
                      </div>
                    </td>
                    <td className="mono">{c.summary}</td>
                    <td>{c.user?.name ?? '—'}</td>
                    <td className="mono note" title={c.sha256}>{c.sha256.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
