'use client';

// «Leggi lo schizzo» (round 50): the sketch sent to the reading route (POST …/schizzi/<id>/lettura, Claude through
// Vertex AI in the EU, src/server/schizzi/lettura.ts), which may take up to two minutes — the seconds shown (out of the
// live region), a button to give up (the request aborted) —, then the proposal in the confirm table, under the AI Act notice (art. 50: the
// values are the model's until confirmed), with the units it read, the measures it could not read and its warnings.
// Only the proposal's shape is taken from the answer (zod): the server already kept it within the catalog.
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import type { Target } from '@/lib/schizzi/campi';
import { UNITA, chiaveNonLetto, type Proposta } from '@/lib/schizzi/proposta';
import type { SchizzoView } from '@/server/schizzi/queries';
import { BY_STATUS } from '../allegati/send';
import ConfermaValori, { useTestiCampo, type Modulo } from './ConfermaValori';

const valore = z.union([z.number(), z.string(), z.boolean()]);
const rispostaSchema = z.object({
  ok: z.literal(true),
  cached: z.boolean(),
  proposta: z.object({
    target: z.enum(['vano', 'locale']),
    units: z.enum(UNITA),
    fields: z.array(z.object({ id: z.string(), value: valore, confidence: z.number().min(0).max(1), read: z.string(), note: z.string().optional() })).max(400),
    notRead: z.array(z.object({ id: z.string(), code: z.enum(['nonLetto', 'tipo', 'fuoriIntervallo', 'doppio']), reason: z.string() })).max(400),
    warnings: z.array(z.string()).max(10),
    model: z.string(),
    promptVersion: z.string(),
  }),
});
const erroreSchema = z.object({ ok: z.literal(false), error: z.string(), message: z.string().optional() });

type Stato = { at: 'idle' } | { at: 'reading'; since: number } | { at: 'done'; proposta: Proposta; cached: boolean; n: number } | { at: 'error'; text: string };

/** A reading under way: a fixed sentence in the live region (a screen reader says it once), the seconds beside it shown
 *  but not announced — they change every second —, and the button to give up. */
export function InLettura({ secondi, onAnnulla }: { secondi: number; onAnnulla(): void }) {
  const t = useTranslations('schizzi');
  return (
    <>
      <span className="note" role="status">{t('pannello.inLettura')}</span>
      <span className="note" aria-hidden="true">{t('pannello.secondi', { s: secondi })}</span>
      <button type="button" className="btn btn-sm" onClick={onAnnulla}>{t('pannello.annulla')}</button>
    </>
  );
}

export default function LetturaSchizzo({ projectId, schizzo, target, modulo, quando }: {
  projectId: string; schizzo: SchizzoView; target: Target; modulo: Modulo;
  /** the sketch's upload date as the page writes it */
  quando: string;
}) {
  const t = useTranslations('schizzi'), te = useTranslations('errors'), { etichetta } = useTestiCampo(target);
  const [stato, setStato] = useState<Stato>({ at: 'idle' });
  const [now, setNow] = useState(0);
  const ctrl = useRef<AbortController | null>(null), runs = useRef(0);
  // the seconds of a reading under way; a reading still running when the panel goes is given up
  useEffect(() => {
    if (stato.at !== 'reading') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [stato.at]);
  useEffect(() => () => ctrl.current?.abort(), []);

  const leggi = async (): Promise<void> => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const since = Date.now();
    setNow(since);
    setStato({ at: 'reading', since });
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/schizzi/${encodeURIComponent(schizzo.id)}/lettura`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }), signal: c.signal, cache: 'no-store',
      });
      const body: unknown = await res.json().catch(() => null), ok = rispostaSchema.safeParse(body);
      if (res.ok && ok.success) {
        runs.current += 1;
        setStato({ at: 'done', proposta: ok.data.proposta, cached: ok.data.cached, n: runs.current });
        return;
      }
      const err = erroreSchema.safeParse(body), key = err.success ? err.data.error : BY_STATUS[res.status] ?? 'unexpected';
      setStato({ at: 'error', text: err.success && err.data.message ? err.data.message : te.has(key) ? te(key) : te('unexpected') });
    } catch {
      setStato({ at: 'error', text: c.signal.aborted ? t('pannello.annullata') : t('pannello.erroreRete') });
    }
  };

  const reading = stato.at === 'reading';
  return (
    <div className="schizzo-lettura">
      <p className="alert alert-info schizzo-ai" role="note">{t('aiNotice')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => void leggi()} disabled={reading} data-schizzi="leggi">{t('pannello.leggi')}</button>
        {reading ? <InLettura secondi={Math.max(0, Math.round((now - stato.since) / 1000))} onAnnulla={() => ctrl.current?.abort()} /> : null}
        {stato.at === 'error' ? <span className="note bad" role="alert">{stato.text}</span> : null}
      </div>
      {stato.at === 'done' ? (
        <>
          <p className="note">
            {t('pannello.unita', { units: t(`unita.${stato.proposta.units}`) })}
            {stato.cached ? ` ${t('pannello.daMemoria')}` : ''}
          </p>
          {stato.proposta.fields.length ? (
            <ConfermaValori key={`${schizzo.id}:${stato.n}`} target={target} fonte="ai" modulo={modulo} caption={t('tabella.caption_ai')}
              righe={stato.proposta.fields.map((f) => ({ id: f.id, value: f.value, confidence: f.confidence, read: f.read, ...(f.note ? { note: f.note } : {}) }))}
              applicati={(n) => t('tabella.applicatiSchizzo', { n, date: quando })} />
          ) : <p className="note">{t('pannello.nessunValore')}</p>}
          {stato.proposta.notRead.length ? (
            <div className="schizzo-elenco">
              <h4>{t('tabella.nonLetti')}</h4>
              <ul>{stato.proposta.notRead.map((n, i) => <li key={chiaveNonLetto(n, i)}>{etichetta(n.id)}: {n.reason || t(`motivi.${n.code}`)}</li>)}</ul>
            </div>
          ) : null}
          {stato.proposta.warnings.length ? (
            <div className="schizzo-elenco">
              <h4>{t('tabella.avvisi')}</h4>
              <ul>{stato.proposta.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
