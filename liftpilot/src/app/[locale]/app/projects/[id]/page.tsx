import { notFound } from 'next/navigation';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { getProject, latestLiftDesign, listCalculations, listDrawingSets, listLiftDesigns, listRoomDesigns, listShaftDesigns } from '@/server/queries';
import { outdated } from '@/server/records';
import { liftInputsReadSchema } from '@/lib/lift-input';
import { visiblePrices } from '@/server/prices';
import LiftView from '@/components/lift/LiftView';
import { setProjectArchivedAction, upgradeProjectAction } from '@/server/project-actions';
import Crumbs from '@/components/Crumbs';
import RefreshForm from '@/components/RefreshForm';
import RecordTable from '@/components/project/RecordTable';
import { pitchesOf } from '@/lib/plant';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('projects');
  return { title: `${t('project')} ${(await params).id.slice(-6)}` };
}

// An installation. A whole project has one way in, its form (/progetto): the latest lift design in 3D, its saved
// versions, the drawing sets; the records made before the one form (shaft designs, calculations, the machine rooms of a
// replacement become a whole project) are in the archive. A machine replacement shows its calculations, its machine
// rooms and the way to a whole project. A record the running engines no longer reproduce is marked, and the latest lift
// design is updated from here in one click.
export default async function ProjectPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const p = await getProject(user, id);
  if (!p) notFound();
  const [t, tc, ts, tt, tl, tm, tf, calcs, designs, sets, lifts, latest, rooms, lang] = await Promise.all([getTranslations('projects'), getTranslations('calculations'),
    getTranslations('shaft'), getTranslations('tavole'), getTranslations('lift'), getTranslations('room'), getTranslations('refresh'), listCalculations(user, p.id),
    listShaftDesigns(user, p.id), listDrawingSets(user, p.id), listLiftDesigns(user, p.id), latestLiftDesign(user, p.id), listRoomDesigns(user, p.id), getLocale()]);
  const latestInputs = latest ? liftInputsReadSchema.safeParse(latest.inputs) : null;
  const fd = dateFormat(locale);
  const place = [p.address, p.city, p.province].filter(Boolean).join(', ');
  const editable = can(user, 'projects:edit') && !p.archivedAt, saves = can(user, 'calc:create') && !p.archivedAt;
  const replacement = p.kind === 'REPLACEMENT';
  // the records of a lift design are reached from it; the others of a whole project are its archive
  const calcRows = calcs.filter((c) => replacement || !c.liftDesign).map((c) => ({ ...c, old: outdated.calc(c) }));
  const shaftRows = designs.filter((d) => !d.liftDesign).map((d) => ({ ...d, old: outdated.shaft(d) }));
  const roomRows = rooms.map((r) => ({ ...r, old: outdated.room(r) }));
  const liftRows = lifts.map((d) => ({ ...d, old: outdated.lift(d) }));
  const archive = !replacement && (calcRows.length > 0 || shaftRows.length > 0 || roomRows.length > 0);
  const setList = sets.length ? (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={tt('list')}>
      {sets.map((x) => (
        <li key={x.id}>
          <Link href={`/app/drawing-sets/${x.id}`} className="num font-semibold">{tt('number')} {x.number}{x.revision ? ` R${x.revision}` : ''}</Link>
          {' · '}<span className="note">{fd.dateTime(x.createdAt)} · {x.user?.name ?? x.authorInitials}</span>
        </li>
      ))}
    </ul>
  ) : null;
  const calcTable = (
    <RecordTable rows={calcRows} href={(x) => `/app/calculations/${x}`} what={tc('col_machine')} locale={locale}
      under={(r) => { const n = calcs.find((c) => c.id === r.id)?._count.reviews ?? 0; return n ? <span className="note">{tc('reviewed', { n })}</span> : null; }} />
  );
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
          {saves ? (replacement
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
            {latest && outdated.lift(latest) ? (
              <div className="alert alert-warn flex flex-col items-start gap-2" role="status">
                <p className="m-0">{tf('design')}</p>
                {saves ? <RefreshForm kind="lift" id={latest.id} /> : null}
              </div>
            ) : null}
            {latestInputs?.success ? <LiftView inputs={latestInputs.data} checks={false} prices={await visiblePrices(user)} pitches={pitchesOf(p.plant)} /> : (
              <div className="panel items-start">
                <p>{tl('homeEmpty')}</p>
                {saves ? <Link className="btn btn-primary" href={`/app/projects/${p.id}/progetto`}>{tl('start')}</Link> : null}
              </div>
            )}
            {liftRows.length > 1 ? <h3>{tl('history')}</h3> : null}
            {liftRows.length > 1 ? <RecordTable rows={liftRows} href={(x) => `/app/lift-designs/${x}`} what={tl('col_design')} locale={locale} /> : null}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2>{tt('list')}</h2>
              <Link className="btn" href={`/app/projects/${p.id}/impianto`}>{tt('plantTitle')}</Link>
            </div>
            {setList ?? <p className="note">{tt('none')} {tt('needDesign')}</p>}
          </section>

          {archive ? (
            <details className="panel archive">
              <summary>{t('archiveTitle')}</summary>
              <p className="note">{t('archiveLead')}</p>
              {shaftRows.length ? <h3>{ts('sectionTitle')}</h3> : null}
              {shaftRows.length ? (
                <RecordTable rows={shaftRows} href={(x) => `/app/shaft-designs/${x}`} what={ts('col_design')} locale={locale}
                  extra={{ label: ts('source'), cell: (r) => (designs.find((d) => d.id === r.id)?.source ? 'DXF/DWG' : ts('sourceHand')) }} />
              ) : null}
              {calcRows.length ? <h3>{tc('title')}</h3> : null}
              {calcRows.length ? calcTable : null}
              {roomRows.length ? <h3>{tm('projectTitle')}</h3> : null}
              {roomRows.length ? <RecordTable rows={roomRows} href={(x) => `/app/room-designs/${x}`} what={tm('col_room')} locale={locale} /> : null}
            </details>
          ) : null}
        </>
      )}

      {replacement ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>{tc('title')}</h2>
            {saves && calcs.length ? <Link className="btn" href={`/app/projects/${p.id}/calc`}>{tc('new')}</Link> : null}
          </div>
          {calcRows.length === 0 ? (
            <div className="panel items-start">
              <p>{tc('empty')}</p>
              {saves ? <Link className="btn btn-primary" href={`/app/projects/${p.id}/calc`}>{tc('new')}</Link> : null}
            </div>
          ) : calcTable}
        </section>
      ) : null}
      {replacement ? (
        <section className="flex flex-col gap-3" aria-labelledby="project-rooms">
          <h2 id="project-rooms">{tm('projectTitle')}</h2>
          {roomRows.length === 0 ? <p className="note">{tm('projectEmpty')}</p>
            : <RecordTable rows={roomRows} href={(x) => `/app/room-designs/${x}`} what={tm('col_room')} locale={locale} />}
          {setList}
          <div><Link className="btn" href={`/app/projects/${p.id}/impianto`}>{tt('plantTitle')}</Link></div>
        </section>
      ) : null}
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
