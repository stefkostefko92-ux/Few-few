import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { plantData, plantDiff } from '@/lib/plant';
import { anagraficaData } from '@/lib/rt/anagrafica';
import { titoloSezione } from '@/lib/rt/sezioni';
import { isSezioneKey } from '@/lib/rt/types';
import { idSchema } from '@/lib/schemas';
import { canonHash } from '@/lib/canon-hash';
import { outdated } from '@/server/records';
import { getRt, listRtRevisions } from '@/server/rt/queries';
import { rtRecord } from '@/server/rt/record';
import Crumbs from '@/components/Crumbs';
import VerdictPill from '@/components/VerdictPill';
import SectionTitle from '@/components/project/SectionTitle';
import '@/components/rt/rt.css';

export async function generateMetadata() {
  const t = await getTranslations('rt');
  return { title: t('pagina.titolo') };
}

const revisioni = z.array(z.object({ mark: z.string(), text: z.string(), date: z.string() }).passthrough());
const risultati = z.object({
  sezioni: z.array(z.object({ key: z.string(), automatica: z.boolean(), motivi: z.array(z.object({ testo: z.string(), clausola: z.string() }).passthrough()) }).passthrough()),
  documenti: z.array(z.object({ id: z.string(), titolo: z.string(), stato: z.string(), consigliato: z.boolean(), allegato: z.object({ position: z.number() }).passthrough().optional() }).passthrough()),
}).passthrough();

// An issued relazione tecnica di modifica (RT plan §7, «RT page»): its number and revision, the outcome of its checks as
// stored, its sections and why each is in, the documents it expected and its files, its revisions, the base it was made
// from, the PDF; a notice when the running engines no longer make it again (its kept PDF stays valid and downloadable, a
// new revision makes it again) and when the installation's data or registry changed after its issue; «Nuova revisione»
// on the latest revision of its number. Whoever sees the installation reads it; another company's id: 404.
export default async function RelazionePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const rid = idSchema.safeParse(id), r = rid.success ? await getRt(user, rid.data) : null;
  if (!r) notFound();
  const [t, tp, history] = await Promise.all([getTranslations('rt'), getTranslations('projects'), listRtRevisions(user, r.year, r.seq)]);
  const fd = dateFormat(locale), old = outdated.rt(r), riprodotta = !old && (await rtRecord(r)).ok;
  const res = risultati.safeParse(r.results), revs = revisioni.safeParse(r.revisions);
  const plantMoved = plantDiff(plantData(r.plant), plantData(r.project.plant)).length > 0;
  const anagMoved = canonHash(anagraficaData(r.anagrafica)) !== canonHash(anagraficaData(r.project.anagrafica));
  const ultima = history[history.length - 1]?.id === r.id, live = !r.project.archivedAt;
  const download = can(user, 'report:download') && (!!r.pdf || riprodotta), base = r.roomDesign ?? r.liftDesign;
  return (
    <main className="page rt-page">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${r.projectId}`, label: r.project.name },
        { href: `/app/projects/${r.projectId}/relazione-tecnica`, label: t('titolo') }, { label: `${t('numero', { n: r.number })} R${r.revision}` }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('pagina.titolo')} · {t('numero', { n: r.number })} R{r.revision}</h1>
          <p className="lead">{t('pagina.emessa', { data: fd.dateTime(r.createdAt), nome: r.user?.name ?? '—' })} · {r.summary}</p>
        </div>
        <div className="actions">
          {download ? <a className="btn btn-primary" href={`/api/relazioni/${r.id}/pdf`}>{t('pagina.scarica')}</a> : null}
          {ultima && live && can(user, 'drawings:issue') ? <Link className="btn" href={`/app/projects/${r.projectId}/relazione-tecnica?revisione=${r.id}`}>{t('pagina.nuovaRevisione')}</Link> : null}
        </div>
      </div>
      {!riprodotta ? <p className="alert alert-warn" role="status">{t(r.pdf ? 'pagina.nonRiprodotta' : 'pagina.nonRiprodottaSenzaPdf')}</p> : null}
      {plantMoved || anagMoved ? <p className="alert alert-warn" role="status">{t('pagina.datiCambiati')}</p> : null}
      {!ultima ? <p className="alert alert-info" role="status">{t('pagina.nonUltima')}</p> : null}
      <dl className="cartiglio">
        <div><dt>{t('pagina.esito')}</dt><dd><VerdictPill verdict={r.verdict} fails={r.failCount} warns={r.warnCount} /></dd></div>
        <div><dt>{t('pagina.base')}</dt><dd>
          {r.roomDesign ? <Link href={`/app/room-designs/${r.roomDesign.id}`}>{t('base.rilievo', { data: fd.dateTime(r.roomDesign.createdAt) })}</Link> : null}
          {r.liftDesign ? <Link href={`/app/lift-designs/${r.liftDesign.id}`}>{t('base.progetto', { data: fd.dateTime(r.liftDesign.createdAt) })}</Link> : null}
          {base ? <> · <Link href={`/app/calculations/${r.calculationId}`}>{t('base.calcolo', { data: fd.dateTime(base.calculation.createdAt) })}</Link></> : null}
        </dd></div>
        <div><dt>{t('pagina.motore')}</dt><dd className="num">{r.engineVersion}</dd></div>
        <div className="wide"><dt>{t('pagina.impronta')}</dt><dd className="hash">{r.sha256}</dd></div>
        {r.pdf ? <div className="wide"><dt>{t('pagina.pdf')}</dt><dd className="hash">{t('pagina.pdfConservato', { pagine: r.pdf.pages })} · {r.pdf.sha256}</dd></div> : null}
      </dl>
      {res.success ? (
        <section className="panel flex flex-col gap-3" aria-labelledby="rt-p-sezioni">
          <SectionTitle id="rt-p-sezioni" icon="list-checks">{t('pagina.sezioni')}</SectionTitle>
          <ul className="rec-list">
            {res.data.sezioni.map((s) => (
              <li key={s.key}><b>{isSezioneKey(s.key) ? titoloSezione(s.key) : s.key}</b>
                <span className="chip">{t(s.automatica ? 'sezioni.automatica' : 'sezioni.manuale')}</span>
                <span className="rec-text">{s.motivi.map((m) => (m.clausola ? `${m.testo} (${m.clausola})` : m.testo)).join('; ')}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="panel flex flex-col gap-3" aria-labelledby="rt-p-allegati">
        <SectionTitle id="rt-p-allegati" icon="file-stack">{t('pagina.allegati')}</SectionTitle>
        {r.attachments.length ? (
          <ol className="rt-ordine">
            {r.attachments.map((a) => (
              <li key={a.position}><span className="rt-n">{t('allegati.n', { n: a.position })}</span>
                <span className="rt-file">{a.title}<span className="note"> · {t('allegati.pagine', { n: a.pages })} · SHA-256 {a.sha256.slice(0, 16)}…</span></span>
                {can(user, 'report:download') ? <a className="btn btn-sm" href={`/api/allegati/${a.attachmentId}`}>{t('pagina.scaricaFile')}</a> : null}</li>
            ))}
          </ol>
        ) : <p className="note">{t('allegati.vuoto')}</p>}
        {res.success && res.data.documenti.some((d) => d.stato === 'da_allegare' && !d.consigliato) ? (
          <>
            <h3>{t('pagina.daAllegare')}</h3>
            <ul className="rt-list-plain">{res.data.documenti.filter((d) => d.stato === 'da_allegare' && !d.consigliato).map((d) => <li key={d.id}>{d.titolo}</li>)}</ul>
          </>
        ) : null}
      </section>
      <section className="panel flex flex-col gap-3" aria-labelledby="rt-p-rev">
        <SectionTitle id="rt-p-rev" icon="history">{t('pagina.revisioni')}</SectionTitle>
        <ul className="rec-list">
          {history.map((h) => {
            const text = revisioni.safeParse(h.revisions).data?.[h.revision]?.text ?? '';
            return (
              <li key={h.id}>
                {h.id === r.id ? <b aria-current="page">R{h.revision}</b> : <Link href={`/app/relazioni/${h.id}`}>R{h.revision}</Link>}
                <span className="note">{fd.dateTime(h.createdAt)}</span><span className="rec-text">{text}</span>
              </li>
            );
          })}
        </ul>
        {revs.success ? null : <p className="note">{t('pagina.revisioniIlleggibili')}</p>}
      </section>
    </main>
  );
}
