import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import Icon from '@/components/Icon';
import SectionTitle from '@/components/project/SectionTitle';
import type { SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { calcBom, calcUncounted } from '@/lib/prices/bom';
import { initialsOf } from '@/lib/tavole/compose';
import { issueChecks } from '@/lib/tavole/issue-check';
import { plantReadSchema } from '@/lib/plant';
import { testoAiuto } from '@/lib/aiuto';
import { reproduceRoomRecord } from '@/server/room-compose';
import { projectCost } from '@/server/prices';
import type { getRoomDesign } from '@/server/queries';
import ProjectCost from '@/components/prices/ProjectCost';
import IssueForm from '@/components/tavole/IssueForm';
import { ConAiuto } from '@/components/shaft/Campo';
import AIUTO from '../../../messages/aiuto/progetto.json';

type Room = NonNullable<Awaited<ReturnType<typeof getRoomDesign>>>;

// «Tavole e documenti» of a machine room surveyed for an intervention on the machine room alone (round 53: out of the
// room's page): drawn again from the stored survey and calculation only while the running engines reproduce them (else
// «Aggiorna» on the room's page). The drawing set as a draft (PDF, DXF, DWG, SVG) and the issue of a set, the
// calculation's report, the cost of the replacement with the company's prices for whoever sees prices. Its relazione
// tecnica is the installation's relazione tecnica di modifica (its tab).
export default async function DocumentiLocale({ user, r, locale, sets, files }: {
  user: SessionUser; r: Room; locale: string; sets: ReactNode; files: ReactNode;
}) {
  const [t, tc, td] = await Promise.all([getTranslations('room'), getTranslations('calculations'), getTranslations('documenti')]);
  const rep = reproduceRoomRecord(r, r.calculation), d = rep.ok ? rep.derived : null;
  const live = !r.project.archivedAt, download = !!d && can(user, 'report:download'), issues = !!d && can(user, 'drawings:issue') && live;
  // what the replacement costs with the company's prices: the machine, its support, the parts the test names replaced
  const costed = d && rep.ok ? await projectCost(user, calcBom(rep.values, rep.collaudo, d), 'replacement', { stops: null, travel: d.analysis.ctx.I.H }) : null;
  // before an issue: the machine the data of the installation name against the calculation's, the plant number, the client
  const plant = plantReadSchema.safeParse(r.project.plant ?? {}), checks = issueChecks(plant.success ? plant.data : {}, d?.made ?? null, r.project, true, { whole: false });
  return (
    <div className="doc-blocchi">
      <section className="panel doc-blocco" aria-labelledby="doc-tavole">
        <SectionTitle id="doc-tavole" icon="file-stack">{td('tavole')}</SectionTitle>
        {d ? null : <p className="alert alert-warn" role="status">{td('rifiutati')}</p>}
        {download ? (
          <>
            {/* the drafts' details beside the title (round 52): the lead keeps the essential */}
            <ConAiuto aiuto={testoAiuto(AIUTO, 'room_docs')} nome={t('docsTitle')} block><SectionTitle level={3} icon="file-export">{t('docsTitle')}</SectionTitle></ConAiuto>
            <p className="note">{t('docsLead')}</p>
            <div className="doc-links">
              <a className="btn" href={`/api/room-designs/${r.id}/pdf`}><Icon name="file-pdf" size={18} />{t('docDraft')}</a>
              <a className="btn" href={`/api/room-designs/${r.id}/dxf`}><Icon name="file-dxf" size={18} />DXF</a>
              <a className="btn" href={`/api/room-designs/${r.id}/dwg`}><Icon name="file-dwg" size={18} />DWG</a>
              <a className="btn" href={`/api/room-designs/${r.id}/svg`}><Icon name="file-image" size={18} />SVG</a>
            </div>
          </>
        ) : null}
        {issues ? (
          <div className="flex flex-col gap-3" id="doc-emetti">
            <SectionTitle level={3} icon="file-stack">{td('emetti')}</SectionTitle>
            <p className="note">{t('setsLead')}</p>
            <IssueForm roomDesignId={r.id} initials={initialsOf(user.name)} checks={checks} projectId={r.projectId} />
          </div>
        ) : null}
        {sets}
      </section>
      <section className="panel doc-blocco" aria-labelledby="doc-calcolo">
        <SectionTitle id="doc-calcolo" icon="file-text">{td('calcolo')}</SectionTitle>
        <div className="doc-links">
          {download ? <a className="btn" href={`/api/calculations/${r.calculationId}/relazione`}><Icon name="file-pdf" size={18} />{tc('downloadReport')}</a> : null}
        </div>
      </section>
      {files}
      {costed && rep.ok ? (
        <section className="panel doc-blocco" aria-labelledby="doc-materiali">
          <SectionTitle id="doc-materiali" icon="file-text">{td('materiali')}</SectionTitle>
          <ProjectCost cost={costed.cost} skipped={costed.skipped} uncounted={calcUncounted(rep.collaudo)} locale={locale} scope="calc" editable={can(user, 'prices:edit')} />
        </section>
      ) : null}
    </div>
  );
}
