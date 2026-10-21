'use client';

// Card 5 of the workspace, «Firme ed emissione» (RT plan §3.2, §7): «Redatto da» (name, qualification) and «Verificato
// da» (an engineer — owner's decision 3 —: title, name, the Ordine's province, number, section), the revision's note when
// a revision is prepared; the draft's PDF (the draft kept first); the issue, after a dialog (native, modal: the focus
// stays in it, Esc closes it) that lists what the server will print as not satisfied, missing or still to attach. The
// server decides (issue.ts): a refusal is said in words, the fields it names listed.
import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { NUMERO_ORDINE, TITOLI_VERIFICATORE } from '@/lib/rt/input';
import { issueTechnicalReportAction, reviseTechnicalReportAction } from '@/server/rt/actions';
import type { RtIssueResult } from '@/server/rt/issue';
import type { Conferma, RtSummary } from '@/server/rt/summary';
import type { FormApi } from './CardSezioni';

/** The issue's refusals with their own words here (the others are the app's errors.*). */
const PROPRI = new Set(['conferma', 'allegatoEstraneo', 'allegatiTroppi', 'dataNonValida', 'notaRevisione', 'revisioneNonUltima', 'allegatoEliminato']);

function Riga({ id, path, label, max, f, pattern, hint }: { id: string; path: string; label: string; max: number; f: FormApi; pattern?: string; hint?: string }) {
  const v = f.get(path), bad = f.errore(path);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" maxLength={max} pattern={pattern} disabled={f.readOnly} value={typeof v === 'string' ? v : ''} aria-invalid={bad || undefined}
        aria-describedby={hint ? `${id}-h` : undefined} onChange={(e) => f.set(path, e.target.value || undefined)} />
      {hint ? <span id={`${id}-h`} className={bad ? 'field-hint rt-bad' : 'field-hint'}>{hint}</span> : null}
    </div>
  );
}

export default function CardFirme({ summary, conferma, f, projectId, revisione, canIssue, flush, stopDraft }: {
  summary: RtSummary; conferma: Conferma; f: FormApi; projectId: string; revisione: { id: string; label: string } | null; canIssue: boolean;
  flush: () => Promise<void>; stopDraft: () => void;
}) {
  const t = useTranslations('rt'), te = useTranslations('errors'), router = useRouter(), dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [lists, setLists] = useState<Conferma>(conferma);
  const [msg, setMsg] = useState<{ text: string; campi: string[] } | null>(null);
  const bloccanti = summary.mancanti.filter((m) => m.bloccante);
  const testoCampo = (c: string): string => summary.mancanti.find((m) => m.campo === c)?.testo ?? c;
  const titolo = f.get('firme.verificato.titolo');

  const anteprima = (): void => start(async () => {
    await flush();
    window.location.assign(`/api/projects/${projectId}/relazione-tecnica/anteprima`);
  });
  const apri = (): void => { setLists(conferma); setMsg(null); dialog.current?.showModal(); };
  const emetti = (): void => start(async () => {
    await flush();
    const input = { projectId, inputs: f.inputs, conferma: true };
    const r: RtIssueResult = revisione ? await reviseTechnicalReportAction({ ...input, reportId: revisione.id }) : await issueTechnicalReportAction(input);
    if (r.ok) {
      stopDraft();
      dialog.current?.close();
      router.push(`/app/relazioni/${r.id}`);
      return;
    }
    if (r.error === 'conferma' && r.conferma) { setLists(r.conferma); return; }
    dialog.current?.close();
    setMsg({ text: PROPRI.has(r.error) ? t(`esiti.${r.error}`) : te(r.error), campi: (r.campi ?? []).map(testoCampo) });
  });

  return (
    <section className="panel rt-card" id="rt-firme" aria-labelledby="rt-firme-h">
      <h2 id="rt-firme-h" className="rt-card-title"><span className="rt-step" aria-hidden="true">5</span>{t('card.firme')}</h2>
      <fieldset className="rt-blocco">
        <legend>{t('firme.redatto')}</legend>
        <div className="form-grid">
          <Riga id="rt-red-nome" path="firme.redatto.nome" label={t('firme.nome')} max={120} f={f} />
          <Riga id="rt-red-qual" path="firme.redatto.qualifica" label={t('firme.qualifica')} max={80} f={f} />
        </div>
      </fieldset>
      <fieldset className="rt-blocco">
        <legend>{t('firme.verificato')}</legend>
        <p className="note">{t('firme.verificatoLead')}</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rt-ver-tit">{t('firme.titolo')}</label>
            <select id="rt-ver-tit" className="input" disabled={f.readOnly} value={typeof titolo === 'string' ? titolo : ''} onChange={(e) => f.set('firme.verificato.titolo', e.target.value || undefined)}>
              <option value="">{t('scegli')}</option>
              {TITOLI_VERIFICATORE.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <Riga id="rt-ver-nome" path="firme.verificato.nome" label={t('firme.nomeIng')} max={120} f={f} />
          <Riga id="rt-ver-prov" path="firme.verificato.provincia" label={t('firme.provincia')} max={40} f={f} />
          <Riga id="rt-ver-num" path="firme.verificato.numero" label={t('firme.numero')} max={20} f={f} pattern={NUMERO_ORDINE.source.slice(1, -1)} hint={t('firme.numeroHint')} />
          <div className="field">
            <label htmlFor="rt-ver-sez">{t('firme.sezione')}</label>
            <select id="rt-ver-sez" className="input" disabled={f.readOnly} value={String(f.get('firme.verificato.sezione') ?? '')}
              onChange={(e) => f.set('firme.verificato.sezione', e.target.value || undefined)}>
              <option value="">{t('firme.sezioneNessuna')}</option>
              <option value="A">A</option><option value="B">B</option>
            </select>
          </div>
        </div>
      </fieldset>
      {revisione ? (
        <div className="form-grid">
          <Riga id="rt-rev" path="revisione.testo" label={t('firme.notaRevisione', { rt: revisione.label })} max={120} f={f} hint={t('firme.notaRevisioneHint')} />
        </div>
      ) : null}
      {bloccanti.length ? (
        <div className="alert alert-warn" role="status" id="rt-bloccanti">
          <p className="m-0">{t('emissione.bloccanti')}</p>
          <ul className="rt-list-plain">{bloccanti.map((m) => <li key={m.campo}>{m.testo}</li>)}</ul>
        </div>
      ) : null}
      <div className="rt-row rt-issue">
        <button type="button" className="btn" disabled={pending || f.readOnly} onClick={anteprima}>{t('emissione.anteprima')}</button>
        {canIssue ? (
          <button type="button" className="btn btn-primary" disabled={pending || bloccanti.length > 0} aria-describedby={bloccanti.length ? 'rt-bloccanti' : undefined}
            onClick={apri}>{t(revisione ? 'emissione.emettiRevisione' : 'emissione.emetti')}</button>
        ) : <p className="note">{t('emissione.soloProgettisti')}</p>}
      </div>
      {msg ? (
        <div className="alert alert-bad" role="alert">
          <p className="m-0">{msg.text}</p>
          {msg.campi.length ? <ul className="rt-list-plain">{msg.campi.map((c) => <li key={c}>{c}</li>)}</ul> : null}
        </div>
      ) : null}
      <dialog ref={dialog} className="rt-dialog" aria-labelledby="rt-dlg-h" aria-describedby="rt-dlg-p">
        <h2 id="rt-dlg-h">{t(revisione ? 'emissione.confermaRevisione' : 'emissione.conferma')}</h2>
        <p id="rt-dlg-p" className="note">{t('emissione.confermaLead')}</p>
        {([['falliti', lists.falliti], ['mancanti', lists.mancanti], ['documenti', lists.documenti]] as const).map(([k, xs]) => (xs.length ? (
          <div key={k} className="rt-dlg-group">
            <h3>{t(`emissione.${k}`, { n: xs.length })}</h3>
            <ul className="rt-list-plain">{xs.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ) : null))}
        {!lists.falliti.length && !lists.mancanti.length && !lists.documenti.length ? <p>{t('emissione.nienteDaConfermare')}</p> : null}
        <div className="rt-row">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={emetti}>{t('emissione.confermo')}</button>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => dialog.current?.close()}>{t('annulla')}</button>
        </div>
      </dialog>
    </section>
  );
}
