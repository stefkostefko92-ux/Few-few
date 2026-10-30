'use client';

// One field of the relazione tecnica di modifica's forms (campi.ts): a number with its unit and range, a choice, a text,
// a yes/no, the source of a block of data (what it is, its reference, the RT's file it is in) or a value read on its own
// document with its source. Each one labelled, its hint and its problem tied to it (aria-describedby, aria-invalid), the
// problem in words with the range the server accepts.
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { makeFmt } from '@/lib/present/tr';
import { FONTE_TIPI } from '@/lib/rt/fonte';
import type { Spec } from './campi';
import { numero } from './paths';

/** A file of the RT a source may name. */
export interface FileOpt { id: string; label: string }

export interface CampoProps {
  spec: Spec;
  /** the full path of the field («componenti.quadro.tensioneComando») */
  path: string;
  gruppo: string;
  get: (path: string) => unknown;
  set: (path: string, value: unknown) => void;
  errore: (path: string) => boolean;
  files: readonly FileOpt[];
  readOnly: boolean;
}

/** The range's figures as the app prints numbers (makeFmt: the server's and the browser's text agree), with the decimals
 *  the bounds have. */
const fmt = makeFmt('it');
const decimali = (x: number): number => { const s = String(x), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
export const range = (min: number, max: number, unit: string): { min: string; max: string; unit: string } => {
  const d = Math.max(decimali(min), decimali(max));
  return { min: fmt(min, d), max: fmt(max, d), unit };
};

/** Values of the raw lists (rail profiles, governors, fire classes) that are words, not codes. */
const PAROLE = new Set(['custom', 'manuale', 'nessuna']);

function Num({ id, label, unit, min, max, step, path, get, set, errore, readOnly }: { id: string; label: string; unit: string; min: number; max: number; step?: number }
  & Pick<CampoProps, 'path' | 'get' | 'set' | 'errore' | 'readOnly'>) {
  const t = useTranslations('rt'), v = get(path), bad = errore(path), hint = `${id}-h`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{unit ? ` [${unit}]` : ''}</label>
      <input id={id} className="input num" type="number" inputMode="decimal" step={step ?? 'any'} min={min} max={max} disabled={readOnly}
        value={typeof v === 'number' ? v : ''} aria-invalid={bad || undefined} aria-describedby={hint}
        onChange={(e) => set(path, numero(e.target.value))} />
      <span id={hint} className={bad ? 'field-hint rt-bad' : 'field-hint'} role={bad ? 'alert' : undefined}>
        {t(bad ? 'errori.range' : 'intervallo', range(min, max, unit))}
      </span>
    </div>
  );
}

function Fonte({ id, path, get, set, errore, files, readOnly, legend }: { id: string; legend: string } & Pick<CampoProps, 'path' | 'get' | 'set' | 'errore' | 'files' | 'readOnly'>) {
  const t = useTranslations('rt');
  const tipo = get(`${path}.tipo`), rif = get(`${path}.rif`), file = get(`${path}.attachmentId`), bad = errore(path) || errore(`${path}.rif`) || errore(`${path}.tipo`);
  return (
    <fieldset className="rt-fonte span-2">
      <legend className="field-legend">{legend}</legend>
      <div className="rt-fonte-grid">
        <div className="field">
          <label htmlFor={`${id}-t`}>{t('fonte.tipo')}</label>
          <select id={`${id}-t`} className="input" disabled={readOnly} value={typeof tipo === 'string' ? tipo : ''} aria-invalid={bad || undefined}
            onChange={(e) => set(`${path}.tipo`, e.target.value || undefined)}>
            <option value="">{t('scegli')}</option>
            {FONTE_TIPI.map((x) => <option key={x} value={x}>{t(`fonteTipi.${x}`)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-r`}>{t('fonte.rif')}</label>
          <input id={`${id}-r`} className="input" maxLength={160} disabled={readOnly} value={typeof rif === 'string' ? rif : ''} aria-invalid={bad || undefined}
            aria-describedby={`${id}-rh`} onChange={(e) => set(`${path}.rif`, e.target.value || undefined)} />
          <span id={`${id}-rh`} className={bad ? 'field-hint rt-bad' : 'field-hint'}>{t(bad ? 'errori.fonte' : 'fonte.rifHint')}</span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-a`}>{t('fonte.file')}</label>
          <select id={`${id}-a`} className="input" disabled={readOnly || !files.length} value={typeof file === 'string' ? file : ''}
            onChange={(e) => set(`${path}.attachmentId`, e.target.value || undefined)}>
            <option value="">{t(files.length ? 'fonte.nessunFile' : 'fonte.senzaFile')}</option>
            {files.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
      </div>
    </fieldset>
  );
}

export default function Campo(p: CampoProps) {
  const t = useTranslations('rt'), id = useId(), { spec, path, gruppo, get, set, errore, readOnly } = p;
  const label = t(`campi.${gruppo}.${spec.k}`), bad = errore(path);
  switch (spec.t) {
    case 'num': return <Num id={id} label={label} unit={spec.unit} min={spec.min} max={spec.max} step={spec.step} path={path} get={get} set={set} errore={errore} readOnly={readOnly} />;
    case 'valFonte':
      return (
        <fieldset className="rt-valfonte span-2">
          <legend className="field-legend">{label}</legend>
          <div className="form-grid">
            <Num id={id} label={t('valore')} unit={spec.unit} min={spec.min} max={spec.max} step={spec.step} path={`${path}.valore`} get={get} set={set} errore={errore} readOnly={readOnly} />
          </div>
          <Fonte id={`${id}f`} legend={t('fonte.titolo')} path={`${path}.fonte`} get={get} set={set} errore={errore} files={p.files} readOnly={readOnly} />
        </fieldset>
      );
    case 'fonte': return <Fonte id={id} legend={label} path={path} get={get} set={set} errore={errore} files={p.files} readOnly={readOnly} />;
    case 'bool': {
      const v = get(path);
      return (
        <label className="rt-check span-2" htmlFor={id}>
          <input id={id} type="checkbox" disabled={readOnly} checked={v === true} onChange={(e) => set(path, e.target.checked ? true : undefined)} />
          <span>{label}</span>
        </label>
      );
    }
    case 'enum': {
      const v = get(path);
      return (
        <div className="field">
          <label htmlFor={id}>{label}</label>
          <select id={id} className="input" disabled={readOnly} value={typeof v === 'string' ? v : ''} aria-invalid={bad || undefined}
            onChange={(e) => set(path, e.target.value || undefined)}>
            <option value="">{t('scegli')}</option>
            {spec.opts.map((o) => <option key={o} value={o}>{spec.raw && !PAROLE.has(o) ? o : t(`valori.${o}`)}</option>)}
          </select>
        </div>
      );
    }
    case 'text': {
      const v = get(path), hint = `${id}-h`;
      return (
        <div className="field">
          <label htmlFor={id}>{label}</label>
          <input id={id} className="input" maxLength={spec.max} disabled={readOnly} value={typeof v === 'string' ? v : ''} aria-invalid={bad || undefined}
            aria-describedby={bad ? hint : undefined} onChange={(e) => set(path, e.target.value || undefined)} />
          {bad ? <span id={hint} className="field-hint rt-bad" role="alert">{t('errori.testo', { max: spec.max })}</span> : null}
        </div>
      );
    }
  }
}
