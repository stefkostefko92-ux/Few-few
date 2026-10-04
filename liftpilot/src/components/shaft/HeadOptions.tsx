'use client';

// The shaft at the top floor and in the headroom of an old building: how far each wall stands in (+) or out (−) from
// where it is at the main floor. The car, its rails and the counterweight run plumb; the plan at the headroom shows the
// walls there with dimensions that can also be changed on the drawing (src/shaft/head.ts).
import { useTranslations } from 'next-intl';
import { headOf, type HeadWalls, type ShaftInputs } from '@/shaft';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
}

const WALLS: readonly (keyof HeadWalls)[] = ['front', 'rear', 'left', 'right'];
const int = (s: string): number => Math.round(Number(s.replace(',', '.')));

export default function HeadOptions({ I, set }: Props) {
  const t = useTranslations('shaft'), h = headOf(I), any = WALLS.some((w) => h[w] !== 0);
  const put = (w: keyof HeadWalls, v: number): void => {
    const next = { ...h, [w]: v };
    set({ head: WALLS.some((k) => next[k] !== 0) ? next : undefined });
  };
  return (
    <details className="head-options" open={any || undefined}>
      <summary>{t('hd_title')}</summary>
      <div className="form-grid">
        {WALLS.map((w) => (
          <label className="field" key={w}>
            <span>{t(`hd_${w}`)}</span>
            <input className="input num" type="number" inputMode="numeric" min={-500} max={500} step={5} value={h[w]}
              onChange={(e) => { const v = int(e.target.value); if (Number.isFinite(v)) put(w, v); }} />
          </label>
        ))}
      </div>
      {any ? <button type="button" className="btn btn-sm" onClick={() => set({ head: undefined })}>{t('hd_reset')}</button> : null}
      <p className="note">{t('hd_hint')}</p>
    </details>
  );
}
