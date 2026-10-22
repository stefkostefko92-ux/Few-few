'use client';

// The machine room measured on a DXF or DWG plan (round 50), entirely in the browser as the shaft on /progetto
// (SurveyPanel): the file read with acad-ts (loaded only here), shown, a click inside the room and one inside the shaft
// below measured with the four rays (castRays) — the room with the shaft's layer left out —, the side of the drawing that
// is the room's front wall chosen (the bottom by default). The measures (src/lib/cad/locale.ts) go into the same confirm
// table as a sketch's reading, «dal disegno CAD»; nothing of the drawing leaves the page and nothing of it is kept: the
// survey stores the measures only.
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MM_PER_UNIT, type CadModel, type CadUnits } from '@/lib/cad/model';
import type { DoorSide, Survey } from '@/lib/cad/measure';
import { cadReadError, pickSurvey } from '@/lib/cad/pick';
import { misuraLocale } from '@/lib/cad/locale';
import CadViewer from '../shaft/CadViewer';
import ConfermaValori, { type Modulo } from '../schizzi/ConfermaValori';

const UNITS: readonly Exclude<CadUnits, 'unknown'>[] = ['mm', 'cm', 'dm', 'm', 'in', 'ft'];
const SIDES: readonly DoorSide[] = ['down', 'up', 'left', 'right'];
type What = 'room' | 'shaft';

export default function LocaleCad({ modulo }: { modulo: Modulo }) {
  const t = useTranslations('shaft'), ts = useTranslations('schizzi');
  const [model, setModel] = useState<CadModel | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<Exclude<CadUnits, 'unknown'>>('mm');
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [front, setFront] = useState<DoorSide>('down');
  const [what, setWhat] = useState<What>('room');
  const [room, setRoom] = useState<Survey | null>(null);
  const [shaft, setShaft] = useState<Survey | null>(null);
  const [round, setRound] = useState(0);

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setReading(true);
    setError(null);
    setModel(null);
    setRoom(null);
    setShaft(null);
    setWhat('room');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { readCad } = await import('@/lib/cad/read');
      await new Promise((r) => setTimeout(r, 30)); // let the "reading" state paint before the parse blocks
      const m = readCad(bytes, file.name);
      setModel(m);
      setUnits(m.units === 'unknown' ? 'mm' : m.units);
      setHidden(new Set(m.layers.flatMap((l, i) => (l.hidden ? [i] : []))));
    } catch (e) {
      const { code, detail } = cadReadError(e);
      setError(t(`err_${code}`, { version: detail }));
    } finally {
      setReading(false);
    }
  };

  const onPick = useCallback((x: number, y: number): void => {
    if (!model) return;
    const s = pickSurvey(model, (i) => !hidden.has(i), x, y, MM_PER_UNIT[units]);
    setError(s ? null : t('notClosed'));
    if (!s) return;
    setRound((n) => n + 1);
    if (what === 'room') {
      setRoom(s);
      setWhat('shaft');
    } else setShaft(s);
  }, [model, units, hidden, what, t]);

  const toggle = (i: number): void => {
    const next = new Set(hidden);
    if (next.has(i)) next.delete(i); else next.add(i);
    setHidden(next);
  };
  const misura = useMemo(() => misuraLocale(room, shaft, MM_PER_UNIT[units], front), [room, shaft, units, front]);
  const size = (prefix: 'room' | 'shaft'): { W: number; D: number } | null => {
    const W = misura.values.find((v) => v.id === `${prefix}.W`)?.value, D = misura.values.find((v) => v.id === `${prefix}.D`)?.value;
    return W === undefined || D === undefined ? null : { W, D };
  };
  const r = size('room'), sh = size('shaft');

  return (
    <div className="survey locale-cad">
      <p className="note">{ts('cad.lead')}</p>
      <label className="field">
        <span>{t('file')}</span>
        <input className="input" type="file" accept=".dxf,.dwg,application/dxf,image/vnd.dxf,image/vnd.dwg" onChange={(e) => void onFile(e.target.files?.[0])} disabled={reading}
          data-schizzi="cad-file" />
      </label>
      <p className="note">{t('fileHint')}</p>
      {reading ? <p className="note" role="status">{t('reading')}</p> : null}
      {error ? <p className="alert alert-bad" role="alert">{error}</p> : null}
      {model ? (
        <>
          <p className="note">{t('fileInfo', { format: model.format.toUpperCase(), version: model.version, count: model.count, layers: model.layers.length })}
            {model.truncated ? ` ${t('truncated', { count: model.count })}` : ''}</p>
          <p className="note">{ts('cad.cornice')}</p>
          <div className="survey-row">
            <label className="field">
              <span>{t('units')}</span>
              <select className="input" value={units} onChange={(e) => { const u = UNITS.find((x) => x === e.target.value); if (u) setUnits(u); }}>
                {UNITS.map((u) => <option key={u} value={u}>{t(`unit_${u}`)}</option>)}
              </select>
            </label>
            <fieldset className="field">
              <legend>{ts('cad.anteriore')}</legend>
              <div className="seg-row" role="radiogroup" aria-label={ts('cad.anteriore')}>
                {SIDES.map((s) => (
                  <label key={s} className={front === s ? 'on' : undefined}>
                    <input type="radio" name="locale-front" value={s} checked={front === s} onChange={() => setFront(s)} />
                    {t(`side_${s}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="field">
              <legend>{ts('cad.prossimo')}</legend>
              <div className="seg-row" role="radiogroup" aria-label={ts('cad.prossimo')}>
                {(['room', 'shaft'] as const).map((w) => (
                  <label key={w} className={what === w ? 'on' : undefined}>
                    <input type="radio" name="locale-what" value={w} checked={what === w} onChange={() => setWhat(w)} />
                    {ts(w === 'room' ? 'cad.locale' : 'cad.vano')}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {model.units === 'unknown' ? <p className="alert alert-warn">{t('unitsUnknown')}</p> : null}
          <p className="note" role="status">
            {r ? ts('cad.misuratoLocale', r) : null}{r && sh ? ' · ' : null}{sh ? ts('cad.misuratoVano', sh) : null}{!r && !sh ? t('clickHint') : null}
          </p>
          {misura.skew ? <p className="alert alert-warn">{ts('cad.obliquo')}</p> : null}
          <CadViewer model={model} hidden={hidden} survey={room} door={front} extra={shaft} onPick={onPick}
            labels={{ fit: t('fit'), zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), canvas: ts('cad.canvas') }} />
          <details className="layers">
            <summary>{t('layers')} ({model.layers.length - hidden.size}/{model.layers.length})</summary>
            <p className="note">{ts('cad.strati')}</p>
            <ul>
              {model.layers.map((l, i) => (
                <li key={l.name}>
                  <label><input type="checkbox" checked={!hidden.has(i)} onChange={() => toggle(i)} /> <span className="mono">{l.name}</span> <small className="note">{l.count}</small></label>
                </li>
              ))}
            </ul>
          </details>
          {misura.values.length ? (
            <ConfermaValori key={`${round}:${front}:${units}`} target="locale" fonte="cad" modulo={modulo} caption={ts('tabella.caption_cad')}
              righe={misura.values.map((v) => ({ id: v.id, value: v.value, confidence: null, read: '' }))} applicati={(n) => ts('tabella.applicatiCad', { n })} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
