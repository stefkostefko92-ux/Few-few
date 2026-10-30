import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';
import SectionTitle from '@/components/project/SectionTitle';
import type { SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { liftRecord } from '@/lib/lift-record';
import { savedLiftAdvice } from '@/lib/lift/advice-cache';
import { designOrder } from '@/lib/order/machine';
import { projectCost, visiblePrices } from '@/server/prices';
import { designBasis } from '@/lib/prices/plant-bom';
import { pitchesOf, plantData, plantReadSchema } from '@/lib/plant';
import { withPitches } from '@/shaft/brackets';
import { designBom } from '@/lib/prices/bom';
import { bomKind } from '@/lib/prices/bom-parts';
import { initialsOf } from '@/lib/tavole/compose';
import { issueChecks } from '@/lib/tavole/issue-check';
import { valueMarks } from '@/lib/lift/marks';
import { ambitoOf } from '@/lib/lift/collaudo';
import { macchinaResta } from '@/lib/lift/intervento';
import { testoAiuto } from '@/lib/aiuto';
import type { getLiftDesign } from '@/server/queries';
import ProjectCost from '@/components/prices/ProjectCost';
import IssueForm from '@/components/tavole/IssueForm';
import { ConAiuto } from '@/components/shaft/Campo';
import AIUTO from '../../../messages/aiuto/progetto.json';
import MaterialiProgetto from './MaterialiProgetto';

type Design = NonNullable<Awaited<ReturnType<typeof getLiftDesign>>>;

// «Tavole e documenti» of a saved lift design (round 53: out of the design's page): what the documents are made from is
// derived again with the running engines, and the documents exist only while they reproduce its records (else the note,
// and «Aggiorna» on the design's page). Three blocks: the drawing sets (the export of the sheets, the issue of a set),
// the calculation's report and the plan, the materials and the order (the Panev bill, the cost with the company's prices
// for whoever sees prices, the draft order of the machine — none for a machine kept). `sets`: the issued sets' list.
export default async function DocumentiProgetto({ user, d, locale, sets, files }: {
  user: SessionUser; d: Design; locale: string; sets: ReactNode; files: ReactNode;
}) {
  const [t, tt, ta, tc, td] = await Promise.all([getTranslations('lift'), getTranslations('tavole'), getTranslations('advice'), getTranslations('calculations'), getTranslations('documenti')]);
  const pitches = pitchesOf(d.project.plant), r = liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256), same = r?.same ?? false;
  const dv = r ? { ...r.dv, layout: withPitches(r.dv.layout, pitches) } : null;
  const live = !d.project.archivedAt, download = same && can(user, 'report:download'), issues = same && can(user, 'drawings:issue') && live;
  // drawn on a modernisation keeping the machine: no order (order-export.ts refuses it too)
  const kept = !!dv && macchinaResta(d.calculation.intervento, dv.collaudo);
  const advice = r ? savedLiftAdvice(r.inputs) : null, order = download && r && advice && !kept ? designOrder(r.inputs, advice, r.dv) : null;
  // the cost of its articles with the company's prices: only for whoever sees prices
  const prices = await visiblePrices(user), kind = dv ? bomKind(dv.collaudo) : 'full';
  const costed = dv ? await projectCost(user, designBom(dv, plantData(d.project.plant)), kind, designBasis(dv)) : null;
  // before an issue: the machine the data of the installation name against the catalogue's the set would carry, the plant
  // number of an existing lift, the client, and the data sheet 1 reads that are not entered (plant.ts)
  const plant = plantReadSchema.safeParse(d.project.plant ?? {}), catalog = r ? valueMarks(r.inputs.auto, r.dv, r.dv.bottom, r.dv.collaudo).catalog : null;
  const checks = issueChecks(plant.success ? plant.data : {}, catalog ?? null, d.project, (r?.dv.collaudo.norma ?? 'en81') !== 'en81',
    { whole: true, rails: !r || ambitoOf(r.dv.collaudo, 'gr_stress') === 'applies', underPit: r?.dv.bottom === 'under' });
  return (
    <div className="doc-blocchi">
      <section className="panel doc-blocco" aria-labelledby="doc-tavole">
        <SectionTitle id="doc-tavole" icon="file-stack">{td('tavole')}</SectionTitle>
        {same ? null : <p className="alert alert-warn" role="status">{t('docs_refused')}</p>}
        {download ? (
          <>
            <ConAiuto aiuto={testoAiuto(AIUTO, 'export')} nome={t('doc_export')} block><SectionTitle level={3} icon="file-cad">{t('doc_export')}</SectionTitle></ConAiuto>
            <p className="note">{t('export_lead')}</p>
            <div className="doc-links">
              <a className="btn" href={`/api/lift-designs/${d.id}/pdf`}><Icon name="file-pdf" size={18} />{t('doc_pdf')}</a>
              <a className="btn" href={`/api/lift-designs/${d.id}/dxf`}><Icon name="file-dxf" size={18} />{t('doc_dxf_all')}</a>
              <a className="btn" href={`/api/lift-designs/${d.id}/dwg`}><Icon name="file-dwg" size={18} />{t('doc_dwg')}</a>
              <a className="btn" href={`/api/lift-designs/${d.id}/svg`}><Icon name="file-image" size={18} />{t('doc_svg')}</a>
            </div>
          </>
        ) : null}
        {issues ? (
          <div className="flex flex-col gap-3" id="doc-emetti">
            <SectionTitle level={3} icon="file-stack">{td('emetti')}</SectionTitle>
            <p className="note">{tt('lead')}</p>
            <IssueForm calculationId={d.calculation.id} initials={initialsOf(user.name)} checks={checks} projectId={d.project.id} />
          </div>
        ) : null}
        {sets}
      </section>
      <section className="panel doc-blocco" aria-labelledby="doc-calcolo">
        <SectionTitle id="doc-calcolo" icon="file-text">{td('calcolo')}</SectionTitle>
        <p className="note">{t('docs_lead')}</p>
        <div className="doc-links">
          {download ? <a className="btn" href={`/api/calculations/${d.calculation.id}/relazione`}><Icon name="file-pdf" size={18} />{t('doc_relazione')}</a> : null}
          {download ? <a className="btn" href={`/api/shaft-designs/${d.shaftDesign.id}/dxf`}><Icon name="file-dxf" size={18} />{t('doc_dxf')}</a> : null}
          {download ? <a className="btn" href={`/api/shaft-designs/${d.shaftDesign.id}/svg`}><Icon name="file-image" size={18} />{t('doc_svg_plan')}</a> : null}
          <Link className="btn" href={`/app/calculations/${d.calculation.id}`}><Icon name="calculator" size={18} />{t('doc_calc')}</Link>
          <Link className="btn" href={`/app/shaft-designs/${d.shaftDesign.id}`}><Icon name="floor-plan" size={18} />{t('doc_shaft')}</Link>
        </div>
      </section>
      {files}
      <section className="panel doc-blocco" aria-labelledby="doc-materiali">
        <SectionTitle id="doc-materiali" icon="file-text">{td('materiali')}</SectionTitle>
        {r ? <MaterialiProgetto inputs={r.inputs} pitches={pitches} prices={prices} /> : null}
        {costed ? <ProjectCost cost={costed.cost} skipped={costed.skipped} locale={locale} scope={kind === 'full' ? 'design' : kept ? 'modificationResta' : 'modification'} editable={can(user, 'prices:edit')} /> : null}
        {download ? (
          <div className="flex flex-col gap-3">
            <SectionTitle level={3} icon="file-text">{ta('order_title')}</SectionTitle>
            {/* a machine kept: nothing to order, said in place of what the draft would carry */}
            <p className="note">{kept ? tc('progetto.ordineResta') : ta('order_lead')}</p>
            {order ? (
              <>
                <p className="order-machine">{ta(order.recorded ? 'order_chosen_design' : 'order_advised_design', { machine: `${order.machine.brand} ${order.machine.model}` })}</p>
                <div className="doc-links">
                  <a className="btn" href={`/api/lift-designs/${d.id}/order/docx`}><Icon name="file-text" size={18} />{ta('order_docx')}</a>
                  <a className="btn" href={`/api/lift-designs/${d.id}/order/pdf`}><Icon name="file-pdf" size={18} />{ta('order_pdf')}</a>
                </div>
              </>
            ) : kept ? null : <p className="note">{ta('order_none')}</p>}
          </div>
        ) : null}
      </section>
    </div>
  );
}
