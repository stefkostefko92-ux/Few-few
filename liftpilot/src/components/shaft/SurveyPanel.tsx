'use client';

// Survey of the shaft on a DXF or DWG drawing, entirely in the browser: the file is read with acad-ts (loaded only
// here), hashed with SHA-256 and shown; a click inside the shaft measures it; the user picks the side of the landing
// doors and the layers that are walls. Only the resulting size and the description of the measure leave the page. The
// side of the doors is the one seen on screen whatever the plan's turn (measure.ts aVista: the rays fold the walls'
// direction into [0°, 90°), and a plan turned a few degrees clockwise would otherwise swap W and D). Round 52: the file,
// the unit and the doors' side with their «?».
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import CadViewer from './CadViewer';
import Campo, { ConAiuto } from './Campo';
import { MM_PER_UNIT, type CadModel, type CadUnits } from '@/lib/cad/model';
import { aVista, latoMisurato, shaftSize, type DoorSide, type Survey } from '@/lib/cad/measure';
import { cadReadError, pickSurvey } from '@/lib/cad/pick';
import type { ShaftSource } from '@/lib/shaft-input';

export interface SurveyResult { W: number; D: number; source: ShaftSource }

const UNITS: readonly Exclude<CadUnits, 'unknown'>[] = ['mm', 'cm', 'dm', 'm', 'in', 'ft'];
const SIDES: readonly DoorSide[] = ['down', 'up', 'left', 'right'];

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function SurveyPanel({ onSurvey }: { onSurvey(r: SurveyResult): void }) {
  const t = useTranslations('shaft');
  const [model, setModel] = useState<CadModel | null>(null);
  const [hash, setHash] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<Exclude<CadUnits, 'unknown'>>('mm');
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [door, setDoor] = useState<DoorSide>('down');
  const [open, setOpen] = useState(false);

  const report = useCallback((s: Survey, side: DoorSide, u: Exclude<CadUnits, 'unknown'>, m: CadModel, h: string): void => {
    const k = MM_PER_UNIT[u], { W, D } = shaftSize(aVista(s), k, side);
    onSurvey({ W, D, source: { file: m.name.slice(0, 200), sha256: h, format: m.format, version: m.version.slice(0, 20), units: m.units, mmPerUnit: k,
      point: [s.x, s.y], angle: s.angle, rays: { right: s.right, left: s.left, up: s.up, down: s.down }, door: latoMisurato(s, side) } });
  }, [onSurvey]);

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setReading(true);
    setError(null);
    setModel(null);
    setSurvey(null);
    setOpen(false);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const [h, { readCad }] = await Promise.all([sha256(bytes), import('@/lib/cad/read')]);
      await new Promise((r) => setTimeout(r, 30)); // let the "reading" state paint before the parse blocks
      const m = readCad(bytes, file.name);
      setModel(m);
      setHash(h);
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
    setSurvey(s);
    if (s) report(s, door, units, model, hash);
  }, [model, units, hidden, door, hash, report, t]);

  const toggle = (i: number): void => {
    const next = new Set(hidden);
    if (next.has(i)) next.delete(i); else next.add(i);
    setHidden(next);
    setSurvey(null);
  };
  const setSide = (side: DoorSide): void => {
    setDoor(side);
    if (survey && model) report(survey, side, units, model, hash);
  };
  const setUnit = (u: Exclude<CadUnits, 'unknown'>): void => {
    setUnits(u);
    if (survey && model) report(survey, door, u, model, hash);
  };
  const seen = useMemo(() => (survey ? aVista(survey) : null), [survey]);
  const size = useMemo(() => (seen ? shaftSize(seen, MM_PER_UNIT[units], door) : null), [seen, units, door]);

  return (
    <div className="survey">
      <Campo id="shaft-cad-file" nome={t('file')} aiuto={testoAiuto(AIUTO, 'cad_file')}>
        <input id="shaft-cad-file" className="input" type="file" accept=".dxf,.dwg,application/dxf,image/vnd.dxf,image/vnd.dwg" onChange={(e) => void onFile(e.target.files?.[0])} disabled={reading}
          aria-describedby="shaft-cad-file-hint" />
      </Campo>
      <p className="note" id="shaft-cad-file-hint">{t('fileHint')}</p>
      {reading ? <p className="note" role="status">{t('reading')}</p> : null}
      {error ? <p className="alert alert-bad" role="alert">{error}</p> : null}
      {model ? (
        <>
          <p className="note">{t('fileInfo', { format: model.format.toUpperCase(), version: model.version, count: model.count, layers: model.layers.length })}
            {model.truncated ? ` ${t('truncated', { count: model.count })}` : ''}</p>
          <div className="survey-row">
            <Campo id="shaft-cad-units" nome={t('units')} aiuto={testoAiuto(AIUTO, 'cad_units')}>
              <select id="shaft-cad-units" className="input" value={units} onChange={(e) => setUnit(e.target.value as Exclude<CadUnits, 'unknown'>)}>
                {UNITS.map((u) => <option key={u} value={u}>{t(`unit_${u}`)}</option>)}
              </select>
            </Campo>
            <fieldset className="field" aria-labelledby="shaft-cad-side">
              <legend><ConAiuto aiuto={testoAiuto(AIUTO, 'cad_doorSide')} nome={t('doorSide')}><span id="shaft-cad-side">{t('doorSide')}</span></ConAiuto></legend>
              <div className="seg-row" role="radiogroup" aria-label={t('doorSide')}>
                {SIDES.map((s) => (
                  <label key={s} className={door === s ? 'on' : undefined}>
                    <input type="radio" name="door-side" value={s} checked={door === s} onChange={() => setSide(s)} />
                    {t(`side_${s}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {model.units === 'unknown' ? <p className="alert alert-warn">{t('unitsUnknown')}</p> : null}
          <p className="note" role="status">{size ? t('measured', { W: size.W, D: size.D }) : t('clickHint')}</p>
          <CadViewer model={model} hidden={hidden} survey={seen} door={door} onPick={onPick}
            labels={{ fit: t('fit'), zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), canvas: t('canvas') }} />
          <details className="layers" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary>{t('layers')} ({model.layers.length - hidden.size}/{model.layers.length})</summary>
            <p className="note">{t('layersHint')}</p>
            <ul>
              {model.layers.map((l, i) => (
                <li key={l.name}>
                  <label><input type="checkbox" checked={!hidden.has(i)} onChange={() => toggle(i)} /> <span className="mono">{l.name}</span> <small className="note">{l.count}</small></label>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : null}
    </div>
  );
}
