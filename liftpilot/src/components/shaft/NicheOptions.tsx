'use client';

// Niches in the shaft walls: the counterweight in its niche (the car gains its depth), a recess at each lamp of the
// shaft lighting, the chase of the cable trunking. Each has its wall, where it starts from the wall's corner, its width
// and depth; the plan shows them with dimensions that can also be changed on the drawing. Round 52: each field with its
// «?»; a refinement most jobs never touch, marked `esperto` (hidden in «Semplice»).
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import { KV, PANEV_BACK, RAILS, counterweightSide, cwBracketsOf, layout, type Niche, type NicheUse, type ShaftInputs, type Wall } from '@/shaft';
import Campo from './Campo';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
}

const WALLS: readonly Wall[] = ['front', 'rear', 'left', 'right'];
const USES: readonly NicheUse[] = ['cw', 'light', 'duct'];
const int = (s: string): number => Math.round(Number(s.replace(',', '.')));

/** A new niche for `use` where the current design has room for it. */
function proposal(I: ShaftInputs, use: NicheUse): Niche {
  const L = layout(I), depth = Math.max(10, I.wall - KV.nicheBackMin);
  if (use === 'cw') {
    const side = counterweightSide(I), keep = KV.cwShoe + RAILS[I.cwRail].h + (cwBracketsOf(I) === 'panev' ? PANEV_BACK : KV.nicheGap), rear = side === 'rear';
    const at = (rear ? L.cw.x : L.cw.y) - keep, len = rear ? L.cw.w : L.cw.h;
    return { use, wall: side, at: Math.max(0, Math.round(at)), width: Math.round(len + 2 * keep), depth: Math.min(depth, I.cwWallGap + I.cwDepth) };
  }
  // the lamps and the trunking on a side wall with neither a door nor the counterweight, else at the back
  const free = (['left', 'right', 'rear'] as const).find((w) => L.cwSide !== w && !L.doors.some((d) => d.wall === w)) ?? 'rear';
  const len = free === 'rear' ? I.W : I.D, width = use === 'light' ? 300 : 200;
  return { use, wall: free, at: use === 'light' ? Math.max(0, len - width - 150) : 150, width, depth: Math.min(depth, 100) };
}

export default function NicheOptions({ I, set }: Props) {
  const t = useTranslations('shaft'), list = I.niches ?? [], uid = useId();
  const fid = (i: number, k: string): string => `${uid}-${i}-${k}`;
  const aiuto = { at: testoAiuto(AIUTO, 'nc_at'), width: testoAiuto(AIUTO, 'nc_width'), depth: testoAiuto(AIUTO, 'nc_depth') };
  const put = (i: number, patch: Partial<Niche>): void => set({ niches: list.map((n, j) => (j === i ? { ...n, ...patch } : n)) });
  const drop = (i: number): void => {
    const rest = list.filter((_, j) => j !== i);
    set({ niches: rest.length ? rest : undefined });
  };
  const num = (i: number, key: 'at' | 'width' | 'depth', min: number, max: number) => (
    <Campo id={fid(i, key)} nome={t(`nc_${key}`)} aiuto={aiuto[key]}>
      <input id={fid(i, key)} className="input num" type="number" inputMode="numeric" min={min} max={max} step={10} value={list[i][key]}
        onChange={(e) => { const v = int(e.target.value); if (Number.isFinite(v)) put(i, { [key]: v }); }} />
    </Campo>
  );
  return (
    <details className="niche-options esperto" open={list.length > 0}>
      <summary>{t('nc_title')}</summary>
      {list.map((n, i) => (
        <fieldset className="niche" key={i}>
          <legend>{t(`nc_use_${n.use}`)}</legend>
          <div className="form-grid">
            <Campo id={fid(i, 'use')} nome={t('nc_use')} aiuto={testoAiuto(AIUTO, 'nc_use')}>
              <select id={fid(i, 'use')} className="input" value={n.use} onChange={(e) => put(i, { use: e.target.value as NicheUse })}>
                {USES.map((u) => <option key={u} value={u}>{t(`nc_use_${u}`)}</option>)}
              </select>
            </Campo>
            <Campo id={fid(i, 'wall')} nome={t('nc_wall')} aiuto={testoAiuto(AIUTO, 'nc_wall')}>
              <select id={fid(i, 'wall')} className="input" value={n.wall} onChange={(e) => put(i, { wall: e.target.value as Wall })}>
                {WALLS.map((w) => <option key={w} value={w}>{t(`wall_${w}`)}</option>)}
              </select>
            </Campo>
            {num(i, 'at', 0, 10000)}
            {num(i, 'width', 50, 5000)}
            {num(i, 'depth', 10, 1000)}
          </div>
          <button type="button" className="btn btn-sm" onClick={() => drop(i)}>{t('nc_remove')}</button>
        </fieldset>
      ))}
      <div className="seg-row">
        {USES.map((u) => (
          <button key={u} type="button" disabled={list.length >= 8} onClick={() => set({ niches: [...list, proposal(I, u)] })}>{t(`nc_add_${u}`)}</button>
        ))}
      </div>
      <p className="note">{t('nc_hint')}</p>
    </details>
  );
}
