'use client';

// The machine room over the shaft: whether the design has one, its size and where the shaft lies in it, the height
// (and the ridge of a pitched roof), the slab, the door and the control panel. It is drawn in plan and in section B-B
// and checked (height, free area in front of the panel, door).
import { useTranslations } from 'next-intl';
import { DEFAULT_ROOM, type RoomInputs, type ShaftInputs } from '@/shaft';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
  /** unfolded at first (the one form of an installation) */
  open?: boolean;
}

type NumKey = Exclude<keyof RoomInputs, 'doorWall' | 'panelWall'>;
const WALLS = ['front', 'rear', 'left', 'right'] as const;

export default function RoomOptions({ I, set, open = false }: Props) {
  const t = useTranslations('shaft'), R = I.room;
  const put = (patch: Partial<RoomInputs>): void => { if (R) set({ room: { ...R, ...patch } }); };
  const field = (key: NumKey, min: number, max: number) => (
    <label className="field" key={key}>
      <span>{t(`rm_${key}`)}</span>
      <input className="input num" type="number" inputMode="numeric" min={min} max={max} step={10} value={R?.[key] ?? ''}
        onChange={(e) => { const v = Math.round(Number(e.target.value.replace(',', '.'))); if (Number.isFinite(v)) put({ [key]: v }); }} />
    </label>
  );
  const wall = (key: 'doorWall' | 'panelWall') => (
    <label className="field">
      <span>{t(`rm_${key}`)}</span>
      <select className="input" value={R?.[key]} onChange={(e) => put({ [key]: e.target.value as RoomInputs[typeof key] })}>
        {WALLS.map((w) => <option key={w} value={w}>{t(`wall_${w}`)}</option>)}
      </select>
    </label>
  );
  return (
    <details className="room-options" open={open}>
      <summary>{t('rm_title')}</summary>
      <label className="check">
        <input type="checkbox" checked={R !== null} onChange={(e) => set({ room: e.target.checked ? DEFAULT_ROOM : null })} />
        <span>{t('rm_on')}</span>
      </label>
      {R ? (
        <>
          <div className="form-grid">
            {field('W', 1000, 20000)}
            {field('D', 1000, 20000)}
            {field('shaftX', 0, 20000)}
            {field('shaftY', 0, 20000)}
            {field('H', 1500, 10000)}
            {field('ridge', 0, 15000)}
            {field('slab', 100, 1000)}
          </div>
          <div className="form-grid">
            {wall('doorWall')}
            {field('doorAt', 0, 20000)}
            {field('doorW', 500, 3000)}
            {field('doorH', 1500, 3000)}
          </div>
          <div className="form-grid">
            {wall('panelWall')}
            {field('panelAt', 0, 20000)}
            {field('panelW', 200, 3000)}
            {field('panelD', 100, 1000)}
            {field('panelH', 500, 3000)}
          </div>
        </>
      ) : null}
    </details>
  );
}
