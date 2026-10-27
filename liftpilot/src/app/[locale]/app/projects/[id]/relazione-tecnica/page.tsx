import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { plantData } from '@/lib/plant';
import { anagraficaData } from '@/lib/rt/anagrafica';
import { idSchema } from '@/lib/schemas';
import { getProject } from '@/server/queries';
import { outdated } from '@/server/records';
import { rilievoHints } from '@/server/rt/queries';
import { workspace2Of } from '@/server/rt2/workspace';
import { giornoIt } from '@/server/rt/issue';
import { allegatiOptions, labelOf } from '@/components/allegati/options';
import AllegatiPanel from '@/components/allegati/AllegatiPanel';
import Crumbs from '@/components/Crumbs';
import BaseStato2 from '@/components/rt2/BaseStato2';
import CardAnagrafica from '@/components/rt/CardAnagrafica';
import RelazioniEmesse from '@/components/rt/RelazioniEmesse';
import Rt2Workspace from '@/components/rt2/Rt2Workspace';
import '@/components/rt2/rt2.css';
import SectionTitle from '@/components/project/SectionTitle';
import '@/components/rt/rt.css';

export async function generateMetadata() {
  const t = await getTranslations('rt');
  return { title: t('titolo') };
}

// The relazione tecnica di modifica of an installation (round 52: after the owner's model, lib/rt2): its base — the latest
// «Calcolo argano», or what is missing —, the registry (whoever edits the installation's data), the RT being prepared
// step by step (whoever draws the project: its draft is kept as it is typed), the files, the signatures and the issue
// (whoever issues), the RTs issued (the first RT's too: their pages and PDFs stay). Everyone who sees the installation
// reads it; an archived one is read only.
export default async function RelazioneTecnicaPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ revisione?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const p = await getProject(user, id);
  if (!p) notFound();
  const rev = idSchema.safeParse((await searchParams).revisione);
  const live = !p.archivedAt, canEdit = live && can(user, 'progetto:edit'), canIssue = live && can(user, 'drawings:issue'), canUpload = live && can(user, 'projects:edit');
  const [t, tp, w, hints, options] = await Promise.all([getTranslations('rt'), getTranslations('projects'), workspace2Of(user, p.id, rev.success ? rev.data : undefined, canEdit),
    rilievoHints(user, p.id), allegatiOptions()]);
  const base = w.state.result.ok ? w.state.result.base : null, latest = w.rts[0] ?? null;
  const norma = base && base.base.C.norma !== 'en81' ? base.base.C.norma : null;
  const stato = latest ? (outdated.rt(latest) ? t('stato.daAggiornare') : t('stato.emessa', { n: latest.number, r: latest.revision })) : w.draftAt ? t('stato.bozza') : t('stato.nessuna');
  const panel = <AllegatiPanel user={user} projectId={p.id} live={live} locale={locale} headingId="rt-documenti-caricati" />;
  return (
    <main className="page page-wide rt-page">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('titolo') }]} />
      <div className="page-head">
        <div className="titles">
          <span className="chip" data-rt-stato="">{stato}</span>
          <h1>{t('titolo')}</h1>
          <p className="lead">{p.name}{base && norma ? ` · ${t(`norma.${norma}`)} · ${t(`tipo.${base.calc.tipo}`)}` : ''}</p>
        </div>
        <div className="actions">
          <Link className="btn" href={`/app/projects/${p.id}`}>{t('tornaImpianto')}</Link>
        </div>
      </div>
      <BaseStato2 state={w.state} projectId={p.id} locale={locale} archived={!live} />
      {w.revisione ? (
        <p className="alert alert-info" role="status">{t('revisione.inCorso', { n: w.revisione.number, r: w.revisione.revision + 1 })}{' '}
          <Link href={`/app/relazioni/${w.revisione.id}`}>{t('revisione.apri')}</Link></p>
      ) : null}
      {w.dropped ? <p className="alert alert-warn" role="status">{t('bozza.fileTolti', { n: w.dropped })}</p> : null}
      <CardAnagrafica projectId={p.id} anagrafica={anagraficaData(p.anagrafica)} client={p.client} plant={plantData(p.plant)} collaudo={base?.base.C ?? null}
        calcId={w.state.calc?.id ?? null} readOnly={!canUpload} hints={hints} />
      {base ? (
        <Rt2Workspace projectId={p.id} initial={w.inputs} draftAt={w.draftAt}
          revisione={w.revisione ? { id: w.revisione.id, label: `${t('numero', { n: w.revisione.number })} R${w.revisione.revision}` } : null}
          base={{ V: base.base.V, C: base.base.C, anagrafica: base.base.anagrafica, ...(base.base.liftUse ? { liftUse: base.base.liftUse } : {}) }}
          canEdit={canEdit} canIssue={canIssue} oggi={giornoIt(new Date())} calcHref={`/it/app/calculations/${base.calc.id}`}
          files={w.files.map((f) => ({ id: f.id, title: f.title, kindLabel: labelOf(options.kinds, f.kind), pages: f.pages }))} panel={panel} />
      ) : panel}
      {!canEdit && base ? <p className="note">{t(live ? 'soloLettura' : 'archiviata')}</p> : null}
      <section className="panel flex flex-col gap-3" aria-labelledby="rt-emesse-h">
        <SectionTitle id="rt-emesse-h" icon="file-stack">{t('emesse.titolo')}</SectionTitle>
        <RelazioniEmesse rows={w.rts} locale={locale} download={can(user, 'report:download')} />
      </section>
    </main>
  );
}
