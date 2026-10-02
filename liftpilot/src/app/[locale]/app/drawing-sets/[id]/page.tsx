import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import { revisionsSchema } from '@/lib/tavole/compose';
import { composeStored } from '@/server/drawing-compose';
import { getDrawingSet, listCalculations, listRevisions } from '@/server/queries';
import Crumbs from '@/components/Crumbs';
import IssueForm from '@/components/tavole/IssueForm';
import ShapesSvg from '@/components/drawing/ShapesSvg';

export async function generateMetadata() {
  const t = await getTranslations('tavole');
  return { title: t('title') };
}

// An issued drawing set: its number and revision, the PDF, one sheet at a time drawn again from what the set was made
// of (the same drawing, or a warning that the engines no longer reproduce it), where its calculation and shaft design
// disagree, the revisions and a new revision.
export default async function DrawingSetPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ p?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:view');
  const s = await getDrawingSet(user, id);
  if (!s) notFound();
  const [t, tp, tc] = await Promise.all([getTranslations('tavole'), getTranslations('projects'), getTranslations('calculations')]);
  const fd = dateFormat(locale), fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  const r = composeStored({ ...s, calculation: s.calculation, shaftDesign: s.shaftDesign, logo: s.logo, clientLogo: s.clientLogo });
  const doc = 'doc' in r ? r.doc : null;
  const DEC = { travel: 2, speed: 2, load: 0 } as const;
  const mismatch = 'doc' in r ? r.warnings.map((w) => t(`mm_${w.what}`, { calc: fmt(w.calc, DEC[w.what]), shaft: fmt(w.shaft, DEC[w.what]) })) : [];
  const total = doc?.pages.length ?? s.pages, page = Math.min(Math.max(1, Number((await searchParams).p) || 1), total);
  const sheet = doc?.pages[page - 1];
  const history = await listRevisions(user, s.year, s.seq);
  const revs = revisionsSchema.safeParse(s.revisions);
  const editable = can(user, 'calc:create') && !s.project.archivedAt;
  // only a calculation made from a shaft design gives a drawing set
  const calcs = editable ? (await listCalculations(user, s.projectId)).filter((c) => c.shaftDesignId).map((c) => ({ id: c.id, label: `${fd.dateTime(c.createdAt)}${c.label ? ` · ${c.label}` : ''} · ${c.summary}` })) : [];
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${s.projectId}`, label: s.project.name }, { label: `${t('number')} ${s.number}` }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('title')} · {s.number}{s.revision ? ` R${s.revision}` : ''}</h1>
          <p className="lead">{t('issuedBy', { date: fd.dateTime(s.createdAt), name: s.user?.name ?? s.authorInitials })} · {t('pages', { n: s.pages })}</p>
        </div>
        <div className="actions">
          {doc && can(user, 'report:download') ? <a className="btn btn-primary" href={`/api/drawing-sets/${s.id}/pdf`}>{t('download')}</a> : null}
          <Link className="btn" href={`/app/calculations/${s.calculationId}`}>{tc('viewTitle')}</Link>
        </div>
      </div>
      {doc ? null : <p className="alert alert-warn">{t('engineChanged')}</p>}
      {mismatch.length ? <p className="alert alert-warn" role="status">{t('mismatch', { list: mismatch.join('; ') })}</p> : null}
      {doc && sheet ? (
        <section className="flex flex-col gap-3">
          <nav className="seg-row" aria-label={t('sheets')}>
            {doc.pages.map((_, i) => (
              <Link key={i} href={`/app/drawing-sets/${s.id}?p=${i + 1}`} className={i + 1 === page ? 'on' : undefined} aria-current={i + 1 === page ? 'page' : undefined}>{i + 1}</Link>
            ))}
          </nav>
          <figure className="sheet-page">
            <ShapesSvg shapes={sheet.shapes} w={sheet.w} h={sheet.h} id={`sheet-${page}`} label={t('sheet', { n: page, total })} images={doc.images} />
            <figcaption className="note">{t('sheet', { n: page, total })}</figcaption>
          </figure>
        </section>
      ) : null}
      <section className="panel">
        <h2>{t('history')}</h2>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {history.map((h) => (
            <li key={h.id}>
              {h.id === s.id ? <b>{h.revision ? `R${h.revision}` : t('firstIssue')}</b> : <Link href={`/app/drawing-sets/${h.id}`}>{h.revision ? `R${h.revision}` : t('firstIssue')}</Link>}
              {' · '}<span className="note">{fd.dateTime(h.createdAt)}</span>
              {h.revision && revs.success ? ` · ${revisionsSchema.safeParse(h.revisions).data?.[h.revision - 1]?.text ?? ''}` : ''}
            </li>
          ))}
        </ul>
        {editable && calcs.length ? (
          <>
            <h3>{t('revise')}</h3>
            <IssueForm revise={{ drawingSetId: s.id, calculations: calcs }} />
          </>
        ) : null}
      </section>
    </main>
  );
}
