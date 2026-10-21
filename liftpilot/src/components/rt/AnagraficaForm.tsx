'use client';

// Card 1 of the workspace, the installation's registry for the relazione tecnica di modifica (owner's decision 8;
// Project.anagrafica): the owner (or «coincide con il committente»), the maintenance company, the construction number,
// the year of installation, the approval regime — only those of the base's part of UNI 10411; derived from the year as a
// guess to confirm on the logbook — and the documented «before» data with their source, with the linked survey's values
// as hints («Usa»). Saved on its own (whoever edits the installation's data); each issued RT keeps its copy.
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ANNO_MIN, PRIMA_FONTI, PRIMA_RANGE, anagraficaSchema, type Anagrafica } from '@/lib/rt/anagrafica';
import { REGIMI, regime, regimeDaAnno } from '@/lib/rt/regimi';
import type { RegimeKey } from '@/lib/rt/types';
import { saveAnagraficaAction } from '@/server/rt/anagrafica-actions';
import { range } from './Campo';
import { getAt, numero, setPath } from './paths';

type Obj = Record<string, unknown>;

export default function AnagraficaForm({ projectId, initial, client, norma, readOnly, hints }: {
  projectId: string; initial: Anagrafica; client: string | null; norma: '10411-1' | '10411-11' | null; readOnly: boolean;
  hints: { persone: number | null; fermate: number | null; matricola: string | null } | null;
}) {
  const t = useTranslations('rt'), te = useTranslations('errors'), router = useRouter();
  const [a, setA] = useState<Obj>(initial as Obj);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const put = (path: string, v: unknown): void => { setA((prev) => setPath(prev, path, v)); setMsg(null); };
  const parsed = anagraficaSchema.safeParse(a), bad = new Set(parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.')));
  const str = (p: string): string => { const v = getAt(a, p); return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''; };
  const anno = getAt(a, 'annoInstallazione'), legge = getAt(a, 'legge');
  const regimi = REGIMI.filter((r) => !norma || r.norma === norma), derivata = legge ? null : regimeDaAnno(typeof anno === 'number' ? anno : undefined, norma === '10411-11');
  const save = (): void => start(async () => {
    const r = await saveAnagraficaAction({ projectId, anagrafica: a });
    setMsg(r.ok ? { ok: true, text: t('anagrafica.salvata') } : { ok: false, text: te(r.error) });
    if (r.ok) router.refresh();
  });
  const text = (id: string, p: string, label: string, max: number, span = false) => (
    <div className={span ? 'field span-2' : 'field'}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" maxLength={max} disabled={readOnly} value={str(p)} aria-invalid={bad.has(p) || undefined} onChange={(e) => put(p, e.target.value || undefined)} />
    </div>
  );
  const num = (id: string, p: string, label: string, min: number, max: number, step: number, hint?: { v: number | null }) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input num" type="number" inputMode="decimal" min={min} max={max} step={step} disabled={readOnly} value={str(p)}
        aria-invalid={bad.has(p) || undefined} aria-describedby={`${id}-h`} onChange={(e) => put(p, numero(e.target.value))} />
      <span id={`${id}-h`} className={bad.has(p) ? 'field-hint rt-bad' : 'field-hint'}>
        {t('intervallo', range(min, max, ''))}
        {hint?.v != null ? <> · {t('anagrafica.dalRilievo', { v: String(hint.v) })} {!readOnly ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => put(p, hint.v)}>{t('anagrafica.usa')}</button> : null}</> : null}
      </span>
    </div>
  );
  return (
    <form className="rt-anagrafica" onSubmit={(e) => { e.preventDefault(); save(); }} aria-label={t('anagrafica.titolo')}>
      <div className="form-grid">
        {text('rt-prop', 'proprietario.nome', t('anagrafica.proprietario'), 160)}
        {client ? (
          <label className="rt-check" htmlFor="rt-prop-cli">
            <input id="rt-prop-cli" type="checkbox" disabled={readOnly} checked={str('proprietario.nome') === client} onChange={(e) => put('proprietario.nome', e.target.checked ? client : undefined)} />
            <span>{t('anagrafica.comeCommittente', { client })}</span>
          </label>
        ) : <span />}
        {text('rt-prop-ind', 'proprietario.indirizzo', t('anagrafica.indirizzo'), 200, true)}
        {text('rt-man', 'manutentore', t('anagrafica.manutentore'), 160)}
        {text('rt-fab', 'numeroFabbrica', t('anagrafica.numeroFabbrica'), 40)}
        {num('rt-anno', 'annoInstallazione', t('anagrafica.anno'), ANNO_MIN, new Date().getFullYear(), 1)}
        <div className="field">
          <label htmlFor="rt-legge">{t('anagrafica.legge')}</label>
          <select id="rt-legge" className="input" disabled={readOnly} value={typeof legge === 'string' ? legge : ''} aria-describedby="rt-legge-h"
            onChange={(e) => put('legge', REGIMI.find((r) => r.key === e.target.value)?.key)}>
            <option value="">{derivata ? t('anagrafica.leggeDerivata', { sigla: regime(derivata).sigla }) : t('scegli')}</option>
            {regimi.map((r) => <option key={r.key} value={r.key}>{r.sigla}</option>)}
          </select>
          <span id="rt-legge-h" className="field-hint">{legge ? regime(legge as RegimeKey).nota ?? t('anagrafica.leggeScelta') : t(derivata ? 'anagrafica.leggeDaConfermare' : 'anagrafica.leggeHint')}</span>
        </div>
        <label className="rt-check span-2" htmlFor="rt-legge-ok">
          <input id="rt-legge-ok" type="checkbox" disabled={readOnly} checked={getAt(a, 'leggeConfermata') === true} onChange={(e) => put('leggeConfermata', e.target.checked ? true : undefined)} />
          <span>{t('anagrafica.leggeConfermata')}</span>
        </label>
      </div>
      <fieldset className="rt-blocco">
        <legend>{t('anagrafica.prima')}</legend>
        <p className="note">{t('anagrafica.primaLead')}</p>
        <div className="form-grid">
          {num('rt-pers', 'prima.persone', t('anagrafica.persone'), PRIMA_RANGE.persone[0], PRIMA_RANGE.persone[1], 1, hints ? { v: hints.persone } : undefined)}
          {num('rt-ferm', 'prima.fermate', t('anagrafica.fermate'), PRIMA_RANGE.fermate[0], PRIMA_RANGE.fermate[1], 1, hints ? { v: hints.fermate } : undefined)}
          {num('rt-sup', 'prima.superficie', t('anagrafica.superficie'), PRIMA_RANGE.superficie[0], PRIMA_RANGE.superficie[1], 0.01)}
          <div className="field">
            <label htmlFor="rt-fonte-prima">{t('anagrafica.fonte')}</label>
            <select id="rt-fonte-prima" className="input" disabled={readOnly} value={str('prima.fonte')} aria-invalid={bad.has('prima.fonte') || undefined}
              onChange={(e) => put('prima.fonte', PRIMA_FONTI.find((x) => x === e.target.value))}>
              <option value="">{t('scegli')}</option>
              {PRIMA_FONTI.map((x) => <option key={x} value={x}>{t(`primaFonti.${x}`)}</option>)}
            </select>
          </div>
        </div>
        {hints?.matricola ? <p className="note">{t('anagrafica.matricolaRilievo', { m: hints.matricola })}</p> : null}
      </fieldset>
      {!readOnly ? (
        <div className="rt-row">
          <button type="submit" className="btn btn-primary" disabled={pending || !parsed.success}>{t('anagrafica.salva')}</button>
          {msg ? <span className={msg.ok ? 'note' : 'note bad'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span> : null}
          {!parsed.success ? <span className="note bad" role="alert">{t('anagrafica.nonValida')}</span> : null}
        </div>
      ) : null}
    </form>
  );
}
