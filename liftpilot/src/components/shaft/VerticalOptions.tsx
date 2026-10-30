'use client';

// The vertical data of a shaft design: rated speed, pit and headroom, the floors from the lowest with their rise, the
// entrance they serve and the main one; then, once the project's data are in, the heights of car, frame and
// counterweight, the buffers and the spaces for the maintenance person, the software's typical values marked as such.
// A new installation starts with the speed, pit, headroom and the number of stops to enter: the stops' rows come with
// that number, each rise (and door, with two entrances) and the main floor to enter (src/lib/lift/blank.ts). Round 52:
// each field and each column of the stops' table with its «?» (messages/aiuto/progetto.json).
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import { BUFFER_TYPES, DEFAULT_VERTICAL, bufferStroke, bufferType, withBufferType, withStandardBuffers, withVerticalValue, type BufferType, type Floor,
  type ShaftInputs, type VerticalInputs } from '@/shaft';
import { screenOf, standOf } from '@/shaft/section';
import { KV_VERT } from '@/shaft/norme-vert';
import { K } from '@/calc/norme';
import { filled, floorRemoved, floorsTo, type BlankKey } from '@/lib/lift/blank';
import { NO_BLANK, StdBadge, fieldId, type FormBlank, type ShaftSet } from '../blank';
import { DalRilievo } from '../collega/origine';
import Campo, { ConAiuto } from './Campo';

interface Props {
  I: ShaftInputs;
  set: ShaftSet;
  /** unfolded at first (the one form of an installation) */
  open?: boolean;
  blank?: FormBlank;
  /** the rated speed fixed by the «Calcolo argano» the Progetto draws on (round 45): shown, not entered */
  fixedV?: { ms: number; label: string };
}

type NumKey = Exclude<keyof VerticalInputs, 'floors' | 'main' | 'topRefuge' | 'pitRefuge' | 'carBufferType' | 'cwBufferType'>;
// an emptied field changes nothing (it is not a zero)
const num = (s: string): number => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
/** The lowest rated speed the field offers: the first hundredth over K.vRatedMin (the bound itself is not a lift). */
const V_MIN_FIELD = Math.round(K.vRatedMin * 100 + 1) / 100;
/** Values worked out until one is entered (missing in the inputs). */
const WORKED_OUT: readonly NumKey[] = ['cwScreen', 'standW', 'standD'];
/** The «?» of the project's own values (the speed when it is typed: the standalone page). */
const DATA_AIUTO = { v: testoAiuto(AIUTO, 'vt_vEdit'), pit: testoAiuto(AIUTO, 'vt_pit'), headroom: testoAiuto(AIUTO, 'vt_headroom') } as const;

export default function VerticalOptions({ I, set, open = false, blank = NO_BLANK, fixedV }: Props) {
  const t = useTranslations('shaft'), tb = useTranslations('blank'), tc = useTranslations('calc'), V = I.vertical, floors = V.floors, is = blank.is;
  const multi = !is('entrances') && I.entrances !== 'one';
  const put = (patch: Partial<VerticalInputs>, entered: readonly BlankKey[] = []): void => set({ vertical: { ...V, ...patch } }, (b) => filled(b, entered));
  // the buffers left to the software as the drawings have them: over 1 m/s the typical hydraulic one (buffers.ts); a size
  // of one entered on that standard first (withVerticalValue), so what is shown is what is kept
  const std = withStandardBuffers(V);
  const shown = (key: NumKey): number | undefined => (key === 'cwScreen' ? screenOf(V) : key === 'standW' ? standOf(V)[0] : key === 'standD' ? standOf(V)[1] : std[key]);
  const field = (key: NumKey, min: number, max: number, step = 10) => (
    <Campo key={key} id={`shaft-vt-${key}`} nome={t(`vt_${key}`)} aiuto={testoAiuto(AIUTO, `vt_${key}`)}
      label={<>{t(`vt_${key}`)}<StdBadge on={WORKED_OUT.includes(key) ? V[key] === undefined : V[key] === DEFAULT_VERTICAL[key]} /></>}>
      <input id={`shaft-vt-${key}`} className="input num" type="number" inputMode="decimal" min={min} max={max} step={step} value={shown(key)}
        onChange={(e) => { const v = num(e.target.value); if (Number.isFinite(v)) set({ vertical: withVerticalValue(V, key, Math.round(v)) }, (b) => filled(b, [])); }} />
    </Campo>
  );
  // the project's own values: empty until entered. The rated speed must be over K.vRatedMin (the server refuses it at or
  // below, shaft-input.ts): the field starts at the first value allowed and says why at once, with the calculator's words
  const slow = !is('v') && !(V.v > K.vRatedMin);
  const data = (key: 'v' | 'pit' | 'headroom', min: number, max: number, step = 10) => {
    const bad = key === 'v' && slow;
    return (
      <Campo key={key} id={fieldId(key)} nome={t(`vt_${key}`)} aiuto={DATA_AIUTO[key]} need={is(key)} label={<>{t(`vt_${key}`)}<DalRilievo id={key} value={is(key) ? '' : V[key]} /></>}>
        <input id={fieldId(key)} className="input num" type="number" inputMode="decimal" min={min} max={max} step={step} value={is(key) ? '' : V[key]}
          aria-required={is(key) || undefined} aria-invalid={bad || undefined} aria-describedby={bad ? `${fieldId(key)}-err` : undefined}
          onChange={(e) => { const v = num(e.target.value); if (Number.isFinite(v)) put({ [key]: key === 'v' ? v : Math.round(v) }, [key]); }} />
        {bad ? <span className="note bad" id={`${fieldId(key)}-err`} role="alert">{tc('err_v')}</span> : null}
      </Campo>
    );
  };
  // a buffer's type: a typical one of it, its support moved so the run-by stays; a pad's stroke follows its height
  const typeField = (side: 'car' | 'cw') => (
    <Campo key={`${side}-type`} id={`shaft-vt-${side}-type`} nome={t(`vt_${side}BufferType`)} aiuto={testoAiuto(AIUTO, `vt_${side}BufferType`)}
      label={<>{t(`vt_${side}BufferType`)}<StdBadge on={!V[`${side}BufferType`]} /></>}>
      <select id={`shaft-vt-${side}-type`} className="input" value={bufferType(V, side)} onChange={(e) => {
        const ty = BUFFER_TYPES.find((x) => x === e.target.value);
        if (ty) set({ vertical: withBufferType(V, side, ty as BufferType) });
      }}>
        {BUFFER_TYPES.map((x) => <option key={x} value={x}>{t(`bt_${x}`)}</option>)}
      </select>
    </Campo>
  );
  const strokeField = (side: 'car' | 'cw') => (bufferType(V, side) === 'pu' ? (
    <Campo key={`${side}-stroke`} id={`shaft-vt-${side}-stroke`} nome={t(`vt_${side}BufferStroke`)} aiuto={testoAiuto(AIUTO, `vt_${side}BufferStroke`)}>
      <input id={`shaft-vt-${side}-stroke`} className="input num" type="number" value={bufferStroke(std, side)} readOnly aria-readonly="true" />
    </Campo>
  ) : field(side === 'car' ? 'carBufferStroke' : 'cwBufferStroke', 10, 2000, 5));
  // the floors and what they leave to enter, with a number of stops, a stop added or one taken off
  const apply = (r: { vertical: VerticalInputs; blank: BlankKey[] }): void => set({ vertical: r.vertical }, () => r.blank);
  const count = (input: HTMLInputElement): void => {
    const n = Math.round(num(input.value));
    if (Number.isFinite(n) && n >= 2 && n <= 60) {
      if (is('floors') || n !== floors.length) apply(floorsTo(V, blank.list, n, multi));
    } else input.value = is('floors') ? '' : String(floors.length);
  };
  const setFloor = (i: number, patch: Partial<Floor>, entered: readonly BlankKey[]): void =>
    put({ floors: floors.map((f, j) => (j === i ? { ...f, ...patch } : f)) }, entered);
  const doors: readonly Floor['door'][] = multi ? ['A', 'B', 'AB'] : ['A'];
  return (
    <details className="vertical-options" open={open}>
      <summary>{t('vt_title')}</summary>
      <div className="form-grid">
        {fixedV ? (
          <Campo id={fieldId('v')} nome={t('vt_v')} aiuto={testoAiuto(AIUTO, 'vt_v')} label={<>{t('vt_v')}<span className="badge calcolo">{fixedV.label}</span></>}>
            <input id={fieldId('v')} className="input num" type="number" value={fixedV.ms} readOnly aria-readonly="true" />
          </Campo>
        ) : data('v', V_MIN_FIELD, 10, 0.01)}
        {data('pit', 100, 10000)}
        {data('headroom', 1000, 20000)}
        <Campo id={fieldId('floors')} nome={tb('count')} aiuto={testoAiuto(AIUTO, 'count')} need={is('floors')}
          label={<>{tb('count')}<DalRilievo id="floors" value={is('floors') ? '' : floors.length} /></>}>
          <input id={fieldId('floors')} key={is('floors') ? 'blank' : floors.length} className="input num" type="number" inputMode="numeric" min={2} max={60} step={1}
            defaultValue={is('floors') ? '' : floors.length} aria-required={is('floors') || undefined} onBlur={(e) => count(e.currentTarget)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); count(e.currentTarget); } }} />
        </Campo>
      </div>
      {is('floors') ? null : (
        <>
          <table className="floors">
            <caption>{t('vt_floors')}</caption>
            <thead>
              <tr>
                <th scope="col"><ConAiuto aiuto={testoAiuto(AIUTO, 'vt_label')} nome={t('vt_label')}>{t('vt_label')}</ConAiuto></th>
                <th scope="col"><ConAiuto aiuto={testoAiuto(AIUTO, 'vt_rise')} nome={t('vt_rise')}>{t('vt_rise')}</ConAiuto></th>
                <th scope="col"><ConAiuto aiuto={testoAiuto(AIUTO, 'vt_door')} nome={t('vt_door')}>{t('vt_door')}</ConAiuto></th>
                <th scope="col"><ConAiuto aiuto={testoAiuto(AIUTO, 'vt_main')} nome={t('vt_main')}>{t('vt_main')}</ConAiuto></th><th />
              </tr>
            </thead>
            <tbody>
              {floors.map((f, i) => {
                const rise = `rise.${i}` as const, door = `fdoor.${i}` as const, doorBlank = multi && is(door);
                return (
                  <tr key={i}>
                    <td><input className="input" value={f.label} maxLength={8} aria-label={t('vt_label')} onChange={(e) => setFloor(i, { label: e.target.value }, [])} /></td>
                    <td className={is(rise) ? 'need' : undefined}>
                      {i < floors.length - 1
                        ? <input id={fieldId(rise)} className="input num" type="number" inputMode="numeric" min={0} max={20000} step={10} value={is(rise) ? '' : f.rise}
                            aria-label={t('vt_rise')} aria-required={is(rise) || undefined}
                            onChange={(e) => { const v = Math.round(num(e.target.value)); if (Number.isFinite(v)) setFloor(i, { rise: v }, [rise]); }} />
                        : '—'}
                    </td>
                    <td className={doorBlank ? 'need' : undefined}>
                      <select id={fieldId(door)} className="input" value={doorBlank ? '' : doors.includes(f.door) ? f.door : 'A'} aria-label={t('vt_door')}
                        aria-required={doorBlank || undefined} onChange={(e) => setFloor(i, { door: e.target.value as Floor['door'] }, [door])}>
                        {doorBlank ? <option value="" disabled>{tb('choose')}</option> : null}
                        {doors.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className={is('main') ? 'need' : undefined}>
                      <input id={i === 0 ? fieldId('main') : undefined} type="radio" name="main-floor" checked={!is('main') && V.main === i} aria-label={t('vt_main')}
                        onChange={() => put({ main: i }, ['main'])} />
                    </td>
                    <td><button type="button" className="btn btn-sm" onClick={() => apply(floorRemoved(V, blank.list, i))} disabled={floors.length <= 2}>{t('vt_remove')}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" className="btn btn-sm" onClick={() => apply(floorsTo(V, blank.list, floors.length + 1, multi))} disabled={floors.length >= 60}>{t('vt_add')}</button>
        </>
      )}
      {blank.full ? (
        <>
          <div className="form-grid">
            {field('carH', 1000, 5000)}
            {field('carOutH', 1000, 6000)}
            {field('platform', 0, 500)}
            {field('opTop', 0, 6000)}
            {field('frameTop', 1000, 8000)}
            {field('frameBelow', 0, 3000)}
            {field('parapet', 0, 2000)}
            {field('cwH', 300, 10000)}
          </div>
          <div className="form-grid">
            {typeField('car')}
            {field('carBuffers', 1, 4, 1)}
            {field('carBufferH', 50, 3000)}
            {strokeField('car')}
            {field('carBufferBase', 0, 3000)}
            {typeField('cw')}
            {field('cwBufferH', 50, 3000)}
            {strokeField('cw')}
            {field('cwBufferBase', 0, 3000)}
            {field('cwRunby', 0, 2000)}
            {field('cwScreen', 300, 6000)}
            {field('standW', 100, 3000)}
            {field('standD', 100, 3000)}
            {/* the doors' unlocking zone (the supplier's): empty, the most the standard allows and the plate under the sills warns */}
            <Campo key="unlockZone" id="shaft-vt-unlockZone" nome={t('vt_unlockZone')} aiuto={testoAiuto(AIUTO, 'vt_unlockZone')}
              label={<>{t('vt_unlockZone')}<StdBadge on={V.unlockZone === undefined} /></>}>
              <input id="shaft-vt-unlockZone" className="input num" type="number" inputMode="numeric" min={50} max={350} step={10} value={V.unlockZone ?? ''} placeholder={String(KV_VERT.unlockMax)}
                onChange={(e) => { const v = num(e.target.value); put({ unlockZone: Number.isFinite(v) ? Math.round(v) : undefined }); }} />
            </Campo>
          </div>
          <p className="note">{t('bt_hint')}</p>
          <div className="form-grid">
            <Campo id="shaft-vt-topRefuge" nome={t('vt_topRefuge')} aiuto={testoAiuto(AIUTO, 'vt_topRefuge')}
              label={<>{t('vt_topRefuge')}<StdBadge on={V.topRefuge === DEFAULT_VERTICAL.topRefuge} /></>}>
              <select id="shaft-vt-topRefuge" className="input" value={V.topRefuge} onChange={(e) => put({ topRefuge: e.target.value === '1' ? 1 : 2 })}>
                {([1, 2] as const).map((r) => <option key={r} value={r}>{t(`refuge_${r}`)}</option>)}
              </select>
            </Campo>
            <Campo id="shaft-vt-pitRefuge" nome={t('vt_pitRefuge')} aiuto={testoAiuto(AIUTO, 'vt_pitRefuge')}
              label={<>{t('vt_pitRefuge')}<StdBadge on={V.pitRefuge === DEFAULT_VERTICAL.pitRefuge} /></>}>
              <select id="shaft-vt-pitRefuge" className="input" value={V.pitRefuge} onChange={(e) => put({ pitRefuge: e.target.value === '1' ? 1 : e.target.value === '2' ? 2 : 3 })}>
                {([1, 2, 3] as const).map((r) => <option key={r} value={r}>{t(`refuge_${r}`)}</option>)}
              </select>
            </Campo>
          </div>
          {/* the typical values again; the project's own (speed, pit, headroom, floors) stay */}
          <button type="button" className="btn btn-sm" onClick={() => set({ vertical: { ...DEFAULT_VERTICAL, v: V.v, pit: V.pit, headroom: V.headroom, floors: V.floors, main: V.main } })}>
            {t('vt_reset')}
          </button>
        </>
      ) : null}
    </details>
  );
}
