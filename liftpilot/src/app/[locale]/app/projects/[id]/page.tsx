import { notFound } from 'next/navigation';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { getProject, latestLiftDesign, listCalculations, listDrawingSets, listLiftDesigns, listShaftDesigns } from '@/server/queries';
import { liftInputsSchema } from '@/lib/lift-input';
import { visiblePrices } from '@/server/prices';
import LiftView from '@/components/lift/LiftView';
import { setProjectArchivedAction, upgradeProjectAction } from '@/server/project-actions';
import VerdictPill from '@/components/VerdictPill';
import Crumbs from '@/components/Crumbs';

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
  const [t, tc, ts, tt, tl, calcs, designs, sets, lifts, latest, lang] = await Promise.all([getTranslations('projects'), getTranslations('calculations'), getTranslations('shaft'),
    getTranslations('tavole'), getTranslations('lift'), listCalculations(user, p.id), listShaftDesigns(user, p.id), listDrawingSets(user, p.id),
    listLiftDesigns(user, p.id), latestLiftDesign(user, p.id), getLocale()]);
  const latestInputs = latest ? liftInputsSchema.safeParse(latest.inputs) : null;
  const fd = dateFormat(locale);
  const place = [p.address, p.city, p.province].filter(Boolean).join(', ');
  const editable = can(user, 'projects:edit') && !p.archivedAt;
  // a machine replacement shows its calculations and the way to a whole project; a whole project its one form first
  const replacement = p.kind === 'REPLACEMENT';
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: t('title') }, { label: p.name }]} />
      <div className="page-head">
        <div className="titles">
          <span className={`kind-tag kind-${p.kind.toLowerCase()}`}>{t(`kind_${p.kind}`)}</span>
          {p.archivedAt ? <span className="chip">{t('archived')}</span> : null}
          <h1>{p.name}</h1>
          {place ? <p className="lead">{place}</p> : null}
        </div>
        <div className="actions">
          {editable ? (replacement
            ? <Link className="btn btn-primary" href={`/app/projects/${p.id}/calc`}>{calcs.length ? tc('new') : t('startReplacement')}</Link>
            : <Link className="btn btn-primary" href={`/app/projects/${p.id}/progetto`}>{latest ? tl('edit') : tl('start')}</Link>) : null}
          {editable ? <Link className="btn" href={`/app/projects/${p.id}/edit`}>{t('edit')}</Link> : null}
          {can(user, 'projects:archive') ? (
            <form action={setProjectArchivedAction}>
              <input type="hidden" name="locale" value={lang} />
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="archive" value={p.archivedAt ? '0' : '1'} />
              <button type="submit" className="btn">{p.archivedAt ? t('restore') : t('archive')}</button>
            </form>
          ) : null}
        </div>
      </div>

      <dl className="cartiglio">
        <div><dt>{t('field_plantNumber')}</dt><dd className="num">{p.plantNumber ?? '—'}</dd></div>
        <div><dt>{t('field_client')}</dt><dd>{p.client ?? '—'}</dd></div>
        <div><dt>{t('createdBy')}</dt><dd>{p.createdBy?.name ?? '—'} · {fd.date(p.createdAt)}</dd></div>
        <div><dt>{t('updated')}</dt><dd>{fd.dateTime(p.updatedAt)}</dd></div>
        {p.notes ? <div className="wide"><dt>{t('field_notes')}</dt><dd className="whitespace-pre-line">{p.notes}</dd></div> : null}
      </dl>

      {replacement ? null : (
        <>
        <section className="flex flex-col gap-3 lift-home">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>{tl('homeTitle')}</h2>
            {latest ? <Link className="btn" href={`/app/lift-designs/${latest.id}`}>{tl('open')}</Link> : null}
          </div>
          {latestInputs?.success ? <LiftView inputs={latestInputs.data} checks={false} prices={await visiblePrices(user)} /> : (
            <div className="panel items-start">
              <p>{tl('homeEmpty')}</p>
              {editable ? <Link className="btn btn-primary" href={`/app/projects/${p.id}/progetto`}>{tl('start')}</Link> : null}
            </div>
          )}
          {lifts.length > 1 ? <h3>{tl('history')}</h3> : null}
          {lifts.length > 1 ? (
            <div className="table-panel">
              <table className="data-table stack">
                <thead><tr><th>{tc('col_date')}</th><th>{tc('col_result')}</th><th>{tl('col_design')}</th><th>{tc('col_author')}</th></tr></thead>
                <tbody>
                  {lifts.map((x) => (
                    <tr key={x.id}>
                      <td className="row-title">
                        <Link href={`/app/lift-designs/${x.id}`} className="font-semibold">{fd.dateTime(x.createdAt)}</Link>
                        {x.label ? <div className="note">{x.label}</div> : null}
                      </td>
                      <td data-label={tc('col_result')}><VerdictPill verdict={x.verdict} fails={x.failCount} warns={x.warnCount} /></td>
                      <td data-label={tl('col_design')} className="spec">{x.summary}</td>
                      <td data-label={tc('col_author')}>{x.user?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>{ts('sectionTitle')}</h2>
            {editable ? <Link className="btn" href={`/app/projects/${p.id}/vano`}>{ts('new')}</Link> : null}
          </div>
          {designs.length === 0 ? (
            <p className="note">{ts('empty')}</p>
          ) : (
            <div className="table-panel">
              <table className="data-table stack">
                <thead>
                  <tr><th>{ts('col_date')}</th><th>{ts('col_result')}</th><th>{ts('col_design')}</th><th>{ts('source')}</th><th>{ts('col_author')}</th></tr>
                </thead>
                <tbody>
                  {designs.map((d) => (
                    <tr key={d.id}>
                      <td className="row-title">
                        <Link href={`/app/shaft-designs/${d.id}`} className="font-semibold">{fd.dateTime(d.createdAt)}</Link>
                        {d.label ? <div className="note">{d.label}</div> : null}
                      </td>
                      <td data-label={ts('col_result')}><VerdictPill verdict={d.verdict} fails={d.failCount} warns={d.warnCount} /></td>
                      <td data-label={ts('col_design')} className="spec">{d.summary}</td>
                      <td data-label={ts('source')}>{d.source ? 'DXF/DWG' : ts('sourceHand')}</td>
                      <td data-label={ts('col_author')}>{d.user?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>{tt('list')}</h2>
            <Link className="btn" href={`/app/projects/${p.id}/impianto`}>{tt('plantTitle')}</Link>
          </div>
          {sets.length === 0 ? <p className="note">{tt('none')} {tt('needDesign')}</p> : (
            <div className="table-panel">
              <table className="data-table stack">
                <thead><tr><th>{tt('number')}</th><th>{tt('revision')}</th><th>{tc('col_date')}</th><th>{tc('col_author')}</th></tr></thead>
                <tbody>
                  {sets.map((x) => (
                    <tr key={x.id}>
                      <td className="row-title"><Link href={`/app/drawing-sets/${x.id}`} className="num font-semibold">{x.number}</Link></td>
                      <td data-label={tt('revision')}>{x.revision ? `R${x.revision}` : tt('firstIssue')}</td>
                      <td data-label={tc('col_date')}>{fd.dateTime(x.createdAt)}</td>
                      <td data-label={tc('col_author')}>{x.user?.name ?? x.authorInitials}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </>
      )}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>{tc('title')}</h2>
          {editable && calcs.length ? <Link className="btn" href={`/app/projects/${p.id}/calc`}>{tc('new')}</Link> : null}
        </div>
        {calcs.length === 0 ? (
          <div className="panel items-start">
            <p>{tc('empty')}</p>
            {editable ? <Link className="btn btn-primary" href={`/app/projects/${p.id}/calc`}>{tc('new')}</Link> : null}
          </div>
        ) : (
          <div className="table-panel">
            <table className="data-table stack">
              <thead>
                <tr><th>{tc('col_date')}</th><th>{tc('col_result')}</th><th>{tc('col_machine')}</th><th>{tc('col_author')}</th><th>{tc('col_hash')}</th></tr>
              </thead>
              <tbody>
                {calcs.map((c) => (
                  <tr key={c.id}>
                    <td className="row-title">
                      <Link href={`/app/calculations/${c.id}`} className="font-semibold">{fd.dateTime(c.createdAt)}</Link>
                      {c.label ? <div className="note">{c.label}</div> : null}
                    </td>
                    <td data-label={tc('col_result')}>
                      <div className="cell-stack">
                        <VerdictPill verdict={c.verdict} fails={c.failCount} warns={c.warnCount} />
                        {c._count.reviews ? <span className="note">{tc('reviewed', { n: c._count.reviews })}</span> : null}
                      </div>
                    </td>
                    <td data-label={tc('col_machine')} className="spec">{c.summary}</td>
                    <td data-label={tc('col_author')}>{c.user?.name ?? '—'}</td>
                    <td data-label={tc('col_hash')} className="mono note" title={c.sha256}>{c.sha256.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {replacement && editable ? (
        <section className="panel items-start">
          <h2>{t('upgradeTitle')}</h2>
          <p className="note">{t('upgradeLead')}</p>
          <form action={upgradeProjectAction}>
            <input type="hidden" name="locale" value={lang} />
            <input type="hidden" name="id" value={p.id} />
            <button type="submit" className="btn">{t('upgrade')}</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
