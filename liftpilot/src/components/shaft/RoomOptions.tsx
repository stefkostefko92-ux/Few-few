'use client';

// The machine room over the shaft: whether the design has one, its size and where the shaft lies in it, the height
// (and the ridge of a pitched roof), the slab, the door and the control panel, and what the machine stands on (its
// support: shims, a frame, beams that may stand clear of the floor, plates or a plinth, with the profile and height).
// It is drawn in plan and in section B-B and checked (height, free area in front of the panel, door, beams).
import { useTranslations } from 'next-intl';
import { DEFAULT_ROOM, type RoomInputs, type ShaftInputs } from '@/shaft';
import { PROFILE_NAMES } from '@/shaft/profiles';
import { SUPPORT_KINDS, hasProfile, profileOf, supportHeight, supportLength, supportOf, type MachineSupport } from '@/shaft/support';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
  /** unfolded at first (the one form of an installation) */
  open?: boolean;
  /** the machine's sheave and the axis the software takes on shims [mm]: the support's fields; missing: none shown */
  machine?: { D: number; shimsAxis: number };
}

type NumKey = Exclude<keyof RoomInputs, 'doorWall' | 'panelWall' | 'support'>;
const WALLS = ['front', 'rear', 'left', 'right'] as const;

export default function RoomOptions({ I, set, open = false, machine }: Props) {
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
  const sup = supportOf(R), putSup = (patch: Partial<MachineSupport>): void => put({ support: { ...sup, ...patch } });
  const num = (label: string, value: number, min: number, max: number, apply: (v: number) => void) => (
    <label className="field">
      <span>{label}</span>
      <input className="input num" type="number" inputMode="numeric" min={min} max={max} step={5} value={Math.round(value)}
        onChange={(e) => { const v = Math.round(Number(e.target.value.replace(',', '.'))); if (Number.isFinite(v)) apply(v); }} />
    </label>
  );
  const supportFields = R && machine ? (
    <>
      <h3>{t('sp_title')}</h3>
      <div className="form-grid">
        <label className="field">
          <span>{t('sp_kind')}</span>
          <select className="input" value={sup.kind} onChange={(e) => {
            const kind = SUPPORT_KINDS.find((k) => k === e.target.value);
            // a new kind starts from its typical profile, height and length
            if (kind) put({ support: kind === 'shims' ? undefined : { kind } });
          }}>
            {SUPPORT_KINDS.map((k) => <option key={k} value={k}>{t(`sp_${k}`)}</option>)}
          </select>
        </label>
        {hasProfile(sup) ? (
          <label className="field">
            <span>{t('sp_profile')}</span>
            <select className="input" value={profileOf(sup)} onChange={(e) => {
              const p = PROFILE_NAMES.find((x) => x === e.target.value);
              if (p) putSup({ profile: p, height: undefined });
            }}>
              {PROFILE_NAMES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        ) : null}
        {num(t('sp_height'), supportHeight(sup, machine.D, machine.shimsAxis), 0, 3000, (v) => putSup({ height: v }))}
        {supportLength(sup, machine.D) !== null ? num(t('sp_length'), supportLength(sup, machine.D) ?? 0, 300, 5000, (v) => putSup({ length: v })) : null}
      </div>
      <p className="note">{t('sp_hint')}</p>
    </>
  ) : null;
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
          {supportFields}
        </>
      ) : null}
    </details>
  );
}
