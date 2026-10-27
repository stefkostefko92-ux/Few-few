'use client';

// The last step of the RT after the owner's model, «Firme ed emissione»: who drew it up and the engineer who verifies it
// (owner's decision 3), the revision's note, the outcome of the checks, what is still missing to issue (each with the
// step it is in), and the issue — the server derives everything again; with checks not met or with «Attenzione» it
// asks the engineer to confirm them first.
import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import type { Rt2Derivato } from '@/lib/rt2/derive';
import type { Rt2Inputs } from '@/lib/rt2/input';
import type { CampoRt2 as Spec, ValoreRt2 } from '@/lib/rt2/types';
import { issueRt2Action } from '@/server/rt2/actions';
import type { Conferma2 } from '@/server/rt2/issue';
import CampoRt2 from './CampoRt2';
import { mancanteTesto } from './mancanti';

type F = NonNullable<Rt2Inputs['firme']>;
const RED: readonly (Exclude<Spec, { t: 'gruppo' }> & { id: 'nome' | 'qualifica' })[] = [
  { id: 'nome', t: 'testo', label: 'Nome e cognome', max: 120 }, { id: 'qualifica', t: 'testo', label: 'Qualifica', max: 80 },
];
const VER: readonly (Exclude<Spec, { t: 'gruppo' }> & { id: 'titolo' | 'nome' | 'provincia' | 'numero' | 'sezione' })[] = [
  { id: 'titolo', t: 'scelta', label: 'Titolo', opzioni: [{ v: 'Ing.', t: 'Ing.' }, { v: 'Dott. Ing.', t: 'Dott. Ing.' }] },
  { id: 'nome', t: 'testo', label: 'Nome e cognome', max: 120 }, { id: 'provincia', t: 'testo', label: 'Provincia dell’Ordine', max: 40 },
  { id: 'numero', t: 'testo', label: 'Numero di iscrizione', max: 20 }, { id: 'sezione', t: 'scelta', label: 'Sezione', opzioni: [{ v: 'A', t: 'A' }, { v: 'B', t: 'B' }] },
];

const ERRORI: Readonly<Record<string, string>> = {
  forbidden: 'Non hai il permesso di emettere la relazione.', rateLimited: 'Troppe emissioni: riprova fra qualche minuto.',
  rtNotEligible: 'Questo impianto non ha un Calcolo argano per una modifica.', rtBaseOutdated: 'Il Calcolo argano va aggiornato con il software attuale.',
  rtIncomplete: 'Mancano dei dati: completa quelli elencati.', dataNonValida: 'La data non può essere nel futuro né prima del Calcolo argano.',
  notaRevisione: 'Scrivi che cosa cambia in questa revisione (da 3 a 120 caratteri).', revisioneNonUltima: 'Si rivede solo l’ultima revisione di un numero.',
  allegatoEstraneo: 'Un file non è di questo impianto.', allegatiTroppi: 'Troppi file o troppe pagine allegate.', allegatoEliminato: 'Un file allegato è stato eliminato.',
  invalidFields: 'Alcuni valori non sono validi.', conflict: 'Un’altra emissione è in corso: riprova.', notFound: 'Impianto non trovato.', archived: 'L’impianto è archiviato.',
};

export default function CardFirme({ n, projectId, inputs, d, set, readOnly, canIssue, revisione, flush, stopDraft }: {
  n: number; projectId: string; inputs: Rt2Inputs; d: Rt2Derivato; set: (path: string, v: ValoreRt2 | undefined) => void; readOnly: boolean;
  canIssue: boolean; revisione: { id: string; label: string } | null; flush: () => Promise<void>; stopDraft: () => void;
}) {
  const router = useRouter(), f: F = inputs.firme ?? {}, mancanti = new Set(d.mancanti.map((m) => m.campo));
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [conf, setConf] = useState<Conferma2 | null>(null);
  const emetti = async (conferma: boolean): Promise<void> => {
    setBusy(true); setErr(null);
    await flush();
    const r = await issueRt2Action({ projectId, inputs, conferma, revisionOf: revisione?.id });
    setBusy(false);
    if (r.ok) { stopDraft(); router.push(`/app/relazioni/${r.id}`); return; }
    if (r.error === 'conferma' && r.conferma) { setConf(r.conferma); return; }
    setErr(ERRORI[r.error] ?? ERRORI.invalidFields);
  };
  return (
    <section className="panel rt-card" id="rt2-firme" aria-labelledby="rt2-firme-h">
      <h2 id="rt2-firme-h" className="rt-card-title"><span className="rt-step" aria-hidden="true">{n}</span>Firme ed emissione</h2>
      <h3>Redatto da</h3>
      <div className="rt2-campi">
        {RED.map((c) => <CampoRt2 key={c.id} spec={c} chiave={`firme.redatto.${c.id}`} value={f.redatto?.[c.id]} proposta={undefined}
          set={(v) => set(`firme.redatto.${c.id}`, v)} need={mancanti.has(`firme.redatto.${c.id}`)} bad={false} readOnly={readOnly} />)}
      </div>
      <h3>Verificato da (ingegnere)</h3>
      <div className="rt2-campi">
        {VER.map((c) => <CampoRt2 key={c.id} spec={c} chiave={`firme.verificato.${c.id}`} value={f.verificato?.[c.id]} proposta={undefined}
          set={(v) => set(`firme.verificato.${c.id}`, v)} need={mancanti.has(`firme.verificato.${c.id}`)} bad={false} readOnly={readOnly} />)}
      </div>
      {revisione ? (
        <div className="rt2-campi">
          <CampoRt2 spec={{ id: 'testo', t: 'testo', label: `Che cosa cambia rispetto a ${revisione.label}`, max: 120 }} chiave="revisione.testo"
            value={inputs.revisione?.testo} proposta={undefined} set={(v) => set('revisione.testo', v)} need bad={false} readOnly={readOnly} />
        </div>
      ) : null}
      <p className={`alert ${d.esito === 'fail' ? 'alert-warn' : 'alert-info'}`} role="status">
        {d.verifiche.length} verifiche: {d.verifiche.filter((v) => v.esito === 'ok').length} soddisfatte, {d.fails} non verificate, {d.warns} con «Attenzione».
      </p>
      {d.mancanti.length ? (
        <details className="rt-mancanti" open>
          <summary>Mancano {d.mancanti.length} dati per emettere</summary>
          <ul className="rt-list-plain">{d.mancanti.map((m) => <li key={`${m.dove}:${m.campo}`}>{mancanteTesto(m)}</li>)}</ul>
        </details>
      ) : null}
      {conf ? (
        <div className="alert alert-warn flex flex-col items-start gap-2" role="alertdialog" aria-labelledby="rt2-conf-h">
          <p id="rt2-conf-h" className="m-0"><b>Confermi l’emissione con queste verifiche?</b></p>
          <ul className="rt-list-plain">{[...conf.fails.map((x) => `Non verificata: ${x}`), ...conf.warns.map((x) => `Attenzione: ${x}`)].map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void emetti(true)}>Emetti comunque</button>
            <button type="button" className="btn" onClick={() => setConf(null)}>Annulla</button></div>
        </div>
      ) : null}
      {err ? <p className="alert alert-warn" role="alert">{err}</p> : null}
      {/* the draft kept first: the preview reads it */}
      <p className="m-0"><a className="btn btn-sm" href={`/api/projects/${projectId}/relazione-tecnica/anteprima`}
        onClick={(e) => { e.preventDefault(); const href = e.currentTarget.href; void flush().then(() => { window.location.href = href; }); }}>Scarica la bozza (PDF)</a></p>
      {canIssue ? (
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" disabled={busy || readOnly || d.mancanti.length > 0} onClick={() => void emetti(false)}>
            {busy ? 'Emissione…' : revisione ? 'Emetti la revisione' : 'Emetti la relazione'}
          </button>
        </div>
      ) : <p className="note">La relazione la emette chi ha il permesso di emettere tavole e relazioni.</p>}
    </section>
  );
}
