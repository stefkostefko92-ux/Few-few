'use client';

// The vertical data of a shaft design: rated speed, the floors from the lowest with their rise and the entrance they
// serve, pit and headroom, heights of car, frame and counterweight, buffers and the spaces for the maintenance person.
// Typical values to start from; section A-A and its checks follow them live.
import { useTranslations } from 'next-intl';
import { DEFAULT_VERTICAL, type Floor, type ShaftInputs, type VerticalInputs } from '@/shaft';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
}

type NumKey = Exclude<keyof VerticalInputs, 'floors' | 'main' | 'topRefuge' | 'pitRefuge'>;
const num = (s: string): number => Number(s.replace(',', '.'));

export default function VerticalOptions({ I, set }: Props) {
  const t = useTranslations('shaft'), V = I.vertical, floors = V.floors;
  const put = (patch: Partial<VerticalInputs>): void => set({ vertical: { ...V, ...patch } });
  const field = (key: NumKey, min: number, max: number, step = 10) => (
    <label className="field" key={key}>
      <span>{t(`vt_${key}`)}</span>
      <input className="input num" type="number" inputMode="decimal" min={min} max={max} step={step} value={V[key]}
        onChange={(e) => { const v = num(e.target.value); if (Number.isFinite(v)) put({ [key]: key === 'v' ? v : Math.round(v) }); }} />
    </label>
  );
  const setFloor = (i: number, patch: Partial<Floor>): void => put({ floors: floors.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const addFloor = (): void => {
    const last = floors[floors.length - 1], n = Number(last?.label);
    const label = Number.isFinite(n) ? String(n + 1) : `${floors.length}`;
    put({ floors: [...floors.slice(0, -1), ...(last ? [{ ...last, rise: last.rise || 3000 }] : []), { label, rise: 0, door: 'A' }] });
  };
  const removeFloor = (i: number): void => {
    if (floors.length <= 2) return;
    const next = floors.filter((_, j) => j !== i);
    put({ floors: next, main: Math.min(V.main > i ? V.main - 1 : V.main, next.length - 1) });
  };
  const doors: readonly Floor['door'][] = I.entrances === 'one' ? ['A'] : ['A', 'B', 'AB'];
  return (
    <details className="vertical-options">
      <summary>{t('vt_title')}</summary>
      <div className="form-grid">
        {field('v', 0.1, 10, 0.05)}
        {field('pit', 100, 10000)}
        {field('headroom', 1000, 20000)}
      </div>
      <table className="floors">
        <caption>{t('vt_floors')}</caption>
        <thead>
          <tr><th scope="col">{t('vt_label')}</th><th scope="col">{t('vt_rise')}</th><th scope="col">{t('vt_door')}</th><th scope="col">{t('vt_main')}</th><th /></tr>
        </thead>
        <tbody>
          {floors.map((f, i) => (
            <tr key={i}>
              <td><input className="input" value={f.label} maxLength={8} aria-label={t('vt_label')} onChange={(e) => setFloor(i, { label: e.target.value })} /></td>
              <td>
                {i < floors.length - 1
                  ? <input className="input num" type="number" inputMode="numeric" min={0} max={20000} step={10} value={f.rise} aria-label={t('vt_rise')}
                      onChange={(e) => { const v = Math.round(num(e.target.value)); if (Number.isFinite(v)) setFloor(i, { rise: v }); }} />
                  : '—'}
              </td>
              <td>
                <select className="input" value={doors.includes(f.door) ? f.door : 'A'} aria-label={t('vt_door')} onChange={(e) => setFloor(i, { door: e.target.value as Floor['door'] })}>
                  {doors.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </td>
              <td><input type="radio" name="main-floor" checked={V.main === i} aria-label={t('vt_main')} onChange={() => put({ main: i })} /></td>
              <td><button type="button" className="btn btn-sm" onClick={() => removeFloor(i)} disabled={floors.length <= 2}>{t('vt_remove')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-sm" onClick={addFloor} disabled={floors.length >= 60}>{t('vt_add')}</button>
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
        {field('carBuffers', 1, 4, 1)}
        {field('carBufferH', 50, 3000)}
        {field('carBufferStroke', 10, 2000, 5)}
        {field('carBufferBase', 0, 3000)}
        {field('cwBufferH', 50, 3000)}
        {field('cwBufferStroke', 10, 2000, 5)}
        {field('cwBufferBase', 0, 3000)}
        {field('cwRunby', 0, 2000)}
      </div>
      <div className="form-grid">
        <label className="field">
          <span>{t('vt_topRefuge')}</span>
          <select className="input" value={V.topRefuge} onChange={(e) => put({ topRefuge: e.target.value === '1' ? 1 : 2 })}>
            {([1, 2] as const).map((r) => <option key={r} value={r}>{t(`refuge_${r}`)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('vt_pitRefuge')}</span>
          <select className="input" value={V.pitRefuge} onChange={(e) => put({ pitRefuge: e.target.value === '1' ? 1 : e.target.value === '2' ? 2 : 3 })}>
            {([1, 2, 3] as const).map((r) => <option key={r} value={r}>{t(`refuge_${r}`)}</option>)}
          </select>
        </label>
      </div>
      <button type="button" className="btn btn-sm" onClick={() => set({ vertical: { ...DEFAULT_VERTICAL, floors: V.floors, main: V.main } })}>{t('vt_reset')}</button>
    </details>
  );
}
