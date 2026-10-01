import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { idSchema } from '@/lib/schemas';
import { liftInputsSchema } from '@/lib/lift-input';
import { shaftHash } from '@/lib/shaft-hash';
import { snapshotHash } from '@/lib/snapshot-hash';
import { deriveLift, LIFT_ENGINE_VERSION } from '@/lib/lift';
import { snapshotOf } from '@/calc/snapshot';
import { shaftSnapshot } from '@/shaft';
import { getLiftDesign } from '@/server/queries';
import LiftView from '@/components/lift/LiftView';
import IssueForm from '@/components/tavole/IssueForm';
import Crumbs from '@/components/Crumbs';
import VerdictPill from '@/components/VerdictPill';

export async function generateMetadata() {
  const t = await getTranslations('lift');
  return { title: t('designTitle') };
}

// A saved installation: the 3D simulation and every check, derived again from the form as entered; the documents
// made from its calculation and shaft design (report, plan in DXF, drawing sets), which exist only while the running
// engines reproduce their hashes.
export default async function LiftDesignPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const d = await getLiftDesign(user, parsedId.data);
  if (!d) notFound();
  const [t, tp, tt] = await Promise.all([getTranslations('lift'), getTranslations('projects'), getTranslations('tavole')]);
  const fd = dateFormat(locale);
  const inputs = liftInputsSchema.safeParse(d.inputs);
  // the running engines give the same records? (else the documents are refused: a new save is needed)
  let same = false;
  if (inputs.success) {
    const dv = deriveLift(inputs.data);
    same = d.engineVersion === LIFT_ENGINE_VERSION && shaftHash(shaftSnapshot(dv.shaft).snapshot) === d.shaftDesign.sha256
      && snapshotHash(snapshotOf(dv.values)) === d.calculation.sha256;
  }
  const editable = can(user.role, 'calc:create') && !d.project.archivedAt;
  return (
    <main className="page page-wide">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${d.project.id}`, label: d.project.name }, { label: t('designTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{d.label || t('designTitle')}</h1>
          <p className="lead">{fd.dateTime(d.createdAt)} · {d.user?.name ?? '—'} · <VerdictPill verdict={d.verdict} fails={d.failCount} warns={d.warnCount} /></p>
        </div>
        <div className="actions">
          {editable ? <Link className="btn btn-primary" href={`/app/projects/${d.project.id}/progetto?from=${d.id}`}>{t('edit')}</Link> : null}
        </div>
      </div>
      {!same ? <p className="alert alert-warn" role="status">{t('engineChanged')}</p> : null}
      {inputs.success ? <LiftView inputs={inputs.data} /> : <p className="alert alert-bad" role="status">{t('unreadable')}</p>}
      <section className="flex flex-col gap-3">
        <h2>{t('docs_title')}</h2>
        <p className="note">{t('docs_lead')}</p>
        {same ? (
          <div className="doc-links">
            {can(user.role, 'report:download') ? <a className="btn" href={`/api/calculations/${d.calculation.id}/relazione`}>{t('doc_relazione')}</a> : null}
            {can(user.role, 'report:download') ? <a className="btn" href={`/api/shaft-designs/${d.shaftDesign.id}/dxf`}>{t('doc_dxf')}</a> : null}
            <Link className="btn" href={`/app/calculations/${d.calculation.id}`}>{t('doc_calc')}</Link>
            <Link className="btn" href={`/app/shaft-designs/${d.shaftDesign.id}`}>{t('doc_shaft')}</Link>
          </div>
        ) : <p className="note">{t('docs_refused')}</p>}
        {same && can(user.role, 'report:download') ? (
          <div className="panel">
            <h3>{t('doc_export')}</h3>
            <p className="note">{t('export_lead')}</p>
            <div className="doc-links">
              <a className="btn" href={`/api/lift-designs/${d.id}/pdf`}>{t('doc_pdf')}</a>
              <a className="btn" href={`/api/lift-designs/${d.id}/dxf`}>{t('doc_dxf_all')}</a>
              <a className="btn" href={`/api/lift-designs/${d.id}/dwg`}>{t('doc_dwg')}</a>
            </div>
          </div>
        ) : null}
        {same && editable ? (
          <div className="panel">
            <h3>{tt('title')}</h3>
            <p className="note">{tt('lead')}</p>
            <IssueForm calculationId={d.calculation.id} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
