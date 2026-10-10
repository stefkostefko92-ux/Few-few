import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';
import SectionTitle from '@/components/project/SectionTitle';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import { ambitoOf } from '@/lib/lift/collaudo';
import { plantData, plantDiff, plantReadSchema } from '@/lib/plant';
import { initialsOf, revisionsSchema } from '@/lib/tavole/compose';
import { issueChecks } from '@/lib/tavole/issue-check';
import { composeStored } from '@/server/drawing-compose';
import { storedCollaudo } from '@/server/records';
import { composeStoredRoom } from '@/server/room-compose';
import { getDrawingSet, listCalculations, listRevisions, listRoomDesigns } from '@/server/queries';
import { roomSummaryLine } from '@/server/room-summary';
import Crumbs from '@/components/Crumbs';
import IssueForm from '@/components/tavole/IssueForm';
import DrawingFigure from '@/components/drawing/DrawingFigure';
import ShapesSvg from '@/components/drawing/ShapesSvg';

export async function generateMetadata() {
  const t = await getTranslations('tavole');
  return { title: t('title') };
}

// An issued drawing set: its number and revision, the PDF (kept as issued), one sheet at a time drawn again from what
// the set was made of (the same drawing, or a warning that the engines no longer reproduce it), where its calculation
// and shaft design disagree, the revisions and a new revision. A replacement's set is drawn from its saved machine room.
export default async function DrawingSetPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ p?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:view');
  const s = await getDrawingSet(user, id);
  if (!s) notFound();
  const [t, tp, tc] = await Promise.all([getTranslations('tavole'), getTranslations('projects'), getTranslations('calculations')]);
  const fd = dateFormat(locale), fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  // the revisions of the number: the first issue's date is R0 in the title block
  const history = await listRevisions(user, s.year, s.seq), first = history.find((h) => h.revision === 0)?.createdAt ?? null;
  const full = s.shaftDesign ? composeStored({ ...s, firstIssuedAt: first, calculation: s.calculation, shaftDesign: s.shaftDesign, logo: s.logo, clientLogo: s.clientLogo }) : null;
  const room = s.roomDesign ? composeStoredRoom({ ...s, firstIssuedAt: first, calculation: s.calculation, roomDesign: s.roomDesign, logo: s.logo, clientLogo: s.clientLogo }) : null;
  const doc = full && 'doc' in full ? full.doc : room && 'doc' in room ? room.doc : null;
  const DEC = { travel: 2, speed: 2, load: 0, carMass: 0 } as const;
  const mismatch = full && 'doc' in full ? full.warnings.map((w) => t(`mm_${w.what}`, { calc: fmt(w.calc, DEC[w.what]), shaft: fmt(w.shaft, DEC[w.what]) })) : [];
  const total = doc?.pages.length ?? s.pages, page = Math.min(Math.max(1, Number((await searchParams).p) || 1), total);
  const sheet = doc?.pages[page - 1];
  const revs = revisionsSchema.safeParse(s.revisions);
  const editable = can(user, 'calc:create') && !s.project.archivedAt;
  // a whole project's set comes from a calculation made from a shaft design, a replacement's from a saved machine room
  const calcs = editable && !s.roomDesign ? (await listCalculations(user, s.projectId)).filter((c) => c.shaftDesignId).map((c) => ({ id: c.id, label: `${fd.dateTime(c.createdAt)}${c.label ? ` · ${c.label}` : ''} · ${c.summary}` })) : [];
  const roomLine = await roomSummaryLine();
  // before a revision, as before an issue: the data of the installation its sheet 1 reads and nobody entered, the plant
  // number of an existing lift, the client — on what the set is drawn from (the machine's name is checked by the server
  // on the record chosen)
  const plant = plantReadSchema.safeParse(s.project.plant ?? {}), Pl = plant.success ? plant.data : {};
  // the data of the installation changed since the set was issued: its sheet 1 keeps the issue's, the relazioni read
  // the project's (elaborati.ts plantChanged says so in them)
  const plantMoved = plantDiff(plantData(s.plant), Pl).map((k) => t(`f_${k}`).replace(/\s*\(.*\)\s*$/, ''));
  const fullIn = full && 'doc' in full ? full.input : null, C = fullIn ? fullIn.marks?.collaudo ?? storedCollaudo(fullIn.values, s.calculation.collaudo) : null;
  const checks = fullIn && C ? issueChecks(Pl, fullIn.marks?.catalog ?? null, s.project, C.norma !== 'en81', { whole: true,
    rails: ambitoOf(C, 'gr_stress') === 'applies', underPit: fullIn.values.layout === 'bottom' && fullIn.marks?.bottom === 'under' })
    : room && 'doc' in room ? issueChecks(Pl, room.derived.made ?? null, s.project, true, { whole: false }) : null;
  const rooms = editable && s.roomDesign ? (await listRoomDesigns(user, s.projectId)).map((x) => ({ id: x.id, label: `${fd.dateTime(x.createdAt)}${x.label ? ` · ${x.label}` : ''} · ${roomLine(x)}` })) : [];
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${s.projectId}`, label: s.project.name }, { label: `${t('number')} ${s.number}` }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('title')} · {s.number}{s.revision ? ` R${s.revision}` : ''}</h1>
          <p className="lead">{t('issuedBy', { date: fd.dateTime(s.createdAt), name: s.user?.name ?? s.authorInitials })} · {t('pages', { n: s.pages })}</p>
        </div>
        <div className="actions">
          {(doc || s.pdf) && can(user, 'report:download') ? <a className="btn btn-primary" href={`/api/drawing-sets/${s.id}/pdf`}>{t('download')}</a> : null}
          {s.roomDesign ? <Link className="btn" href={`/app/room-designs/${s.roomDesign.id}`}>{t('roomTitle')}</Link> : null}
          <Link className="btn" href={`/app/calculations/${s.calculationId}`}>{tc('viewTitle')}</Link>
        </div>
      </div>
      {doc ? null : <p className="alert alert-warn">{t(s.pdf ? 'engineChangedKept' : 'engineChanged')}</p>}
      {mismatch.length ? <p className="alert alert-warn" role="status">{t('mismatch', { list: mismatch.join('; ') })}</p> : null}
      {plantMoved.length ? <p className="alert alert-warn" role="status">{t('plantChanged', { list: plantMoved.join(', ') })}</p> : null}
      {doc && sheet ? (
        <section className="flex flex-col gap-3">
          <nav className="seg-row" aria-label={t('sheets')}>
            {doc.pages.map((_, i) => (
              <Link key={i} href={`/app/drawing-sets/${s.id}?p=${i + 1}`} className={i + 1 === page ? 'on' : undefined} aria-current={i + 1 === page ? 'page' : undefined}>{i + 1}</Link>
            ))}
          </nav>
          <DrawingFigure className="sheet-page" w={sheet.w} h={sheet.h} label={t('sheet', { n: page, total })} caption={t('sheet', { n: page, total })}>
            <ShapesSvg shapes={sheet.shapes} w={sheet.w} h={sheet.h} id={`sheet-${page}`} label={t('sheet', { n: page, total })} images={doc.images} />
          </DrawingFigure>
        </section>
      ) : null}
      {doc && can(user, 'report:download') ? (
        <section className="panel">
          <SectionTitle icon="file-cad">{t('cadTitle')}</SectionTitle>
          <p className="note">{t('cadLead')}</p>
          <div className="doc-links">
            <a className="btn" href={`/api/drawing-sets/${s.id}/dxf`}><Icon name="file-dxf" size={18} />{t('cadDxf')}</a>
            <a className="btn" href={`/api/drawing-sets/${s.id}/dwg`}><Icon name="file-dwg" size={18} />{t('cadDwg')}</a>
          </div>
        </section>
      ) : null}
      <section className="panel">
        <SectionTitle icon="history">{t('history')}</SectionTitle>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {history.map((h) => (
            <li key={h.id}>
              {h.id === s.id ? <b>{h.revision ? `R${h.revision}` : t('firstIssue')}</b> : <Link href={`/app/drawing-sets/${h.id}`}>{h.revision ? `R${h.revision}` : t('firstIssue')}</Link>}
              {' · '}<span className="note">{fd.dateTime(h.createdAt)}</span>
              {h.revision && revs.success ? ` · ${revisionsSchema.safeParse(h.revisions).data?.[h.revision - 1]?.text ?? ''}` : ''}
            </li>
          ))}
        </ul>
        {editable && (calcs.length || rooms.length) ? (
          <>
            <h3>{t('revise')}</h3>
            <IssueForm revise={rooms.length ? { drawingSetId: s.id, rooms } : { drawingSetId: s.id, calculations: calcs }} initials={initialsOf(user.name)}
              checks={checks ? { ...checks, machine: null } : undefined} projectId={s.projectId} />
          </>
        ) : null}
      </section>
    </main>
  );
}
