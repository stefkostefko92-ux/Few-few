'use client';

// The fields of a machine room over the shaft: its size and where the shaft lies in it, the height (and the ridge of a
// pitched roof), the slab, the door and the control panel, and what the machine stands on (its support: shims, a frame,
// beams that may stand clear of the floor, plates, a plinth or, with a diverting pulley, the bedplate that holds it —
// the pulley stays in the room, never in the shaft — with the profile and height). Shared by a whole design's options
// (RoomOptions) and a replacement's survey (components/room). A measure still to enter shows nothing (and a flat roof
// no ridge); the support's fields come with the machine, once the rest is entered. In a whole design the software may
// place the control panel: its wall and place are then shown as it put them, marked as such.
import { useTranslations } from 'next-intl';
import type { RoomInputs } from '@/shaft';
import { PROFILE_NAMES } from '@/shaft/profiles';
import { SUPPORT_KINDS, hasProfile, profileOf, supportHeight, supportLength, supportOf, type MachineSupport } from '@/shaft/support';
import type { MachineShape } from '@/shaft/machine-shape';
import type { RinvioFrame } from '@/shaft/rinvio';
import { mmOf } from '../blank';

export interface RoomMachine {
  /** the machine's sheave and the axis the software takes on shims [mm], where its diverting pulley turns (null: none) */
  D: number;
  shimsAxis: number;
  shape?: MachineShape | null;
  rinvio?: RinvioFrame | null;
}

type Measure = Exclude<keyof RoomInputs, 'support'>;

/** The control panel the software places (registry locale.quadro.posto): whether it does, the switch, where it put it
 *  (null: not yet worked out). */
export interface RoomPanel {
  auto: boolean;
  set(auto: boolean): void;
  placed: Pick<RoomInputs, 'panelWall' | 'panelAt'> | null;
}

interface Props {
  R: RoomInputs;
  /** a change of the room, with the measures it enters */
  put(patch: Partial<RoomInputs>, entered?: readonly Measure[]): void;
  /** the support's fields; missing: none shown */
  machine?: RoomMachine;
  /** a measure still to enter */
  blank?: (key: Measure) => boolean;
  /** the words of an empty choice */
  choose?: string;
  /** the panel's place by the software; missing: always entered */
  panel?: RoomPanel;
}

type NumKey = Exclude<keyof RoomInputs, 'doorWall' | 'panelWall' | 'support'>;
const WALLS = ['front', 'rear', 'left', 'right'] as const;

export default function RoomFields({ R, put, machine, blank = () => false, choose = '—', panel }: Props) {
  const t = useTranslations('shaft'), tl = useTranslations('lift');
  const field = (key: NumKey, min: number, max: number) => (
    <label className={`field${blank(key) ? ' need' : ''}`} key={key}>
      <span>{t(`rm_${key}`)}</span>
      <input id={`bk-room-${key}`} className="input num" type="number" inputMode="numeric" min={min} max={max} step={10}
        value={blank(key) || (key === 'ridge' && R.ridge === 0) ? '' : R[key]} aria-required={blank(key) || undefined}
        onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) put({ [key]: v }, [key]); }} />
    </label>
  );
  const wall = (key: 'doorWall' | 'panelWall') => (
    <label className={`field${blank(key) ? ' need' : ''}`}>
      <span>{t(`rm_${key}`)}</span>
      <select id={`bk-room-${key}`} className="input" value={blank(key) ? '' : R[key]} aria-required={blank(key) || undefined}
        onChange={(e) => put({ [key]: e.target.value as RoomInputs[typeof key] }, [key])}>
        {blank(key) ? <option value="" disabled>{choose}</option> : null}
        {WALLS.map((w) => <option key={w} value={w}>{t(`wall_${w}`)}</option>)}
      </select>
    </label>
  );
  // the panel's wall and place as the software put them
  const placed = (key: 'panelWall' | 'panelAt', text: (P: NonNullable<RoomPanel['placed']>) => string) => (
    <label className="field">
      <span>{t(`rm_${key}`)}</span>
      <output id={`bk-room-${key}`} className="auto-value">{panel?.placed ? text(panel.placed) : '—'} <span className="badge">{tl('badge_auto')}</span></output>
    </label>
  );
  const auto = !!panel?.auto;
  const rf = machine?.rinvio ?? null, sup = supportOf(R, rf !== null), putSup = (patch: Partial<MachineSupport>): void => put({ support: { ...sup, ...patch } });
  const num = (label: string, value: number, min: number, max: number, apply: (v: number) => void) => (
    <label className="field">
      <span>{label}</span>
      <input className="input num" type="number" inputMode="numeric" min={min} max={max} step={5} value={Math.round(value)}
        onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) apply(v); }} />
    </label>
  );
  const supportFields = machine ? (
    <>
      <h3>{t('sp_title')}</h3>
      <div className="form-grid">
        <label className="field">
          <span>{t('sp_kind')}</span>
          <select className="input" value={sup.kind} onChange={(e) => {
            const kind = SUPPORT_KINDS.find((k) => k === e.target.value);
            // a new kind starts from its typical profile, height and length; the one the software takes is left unset
            if (kind) put({ support: kind === (rf ? 'rinvio' : 'shims') ? undefined : { kind } });
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
        {sup.kind === 'rinvio' && rf?.maker ? null
          : num(t('sp_height'), sup.kind === 'rinvio' && rf ? rf.top : supportHeight(sup, machine.D, machine.shimsAxis, machine.shape ?? null), 0, 3000, (v) => putSup({ height: v }))}
        {supportLength(sup, machine.D, machine.shape ?? null) !== null
          ? num(t('sp_length'), supportLength(sup, machine.D, machine.shape ?? null) ?? 0, 300, 5000, (v) => putSup({ length: v })) : null}
      </div>
      {rf ? <p className="note">{rf.on === 'stand' ? t('sp_rinvio_stand', { axis: Math.round(rf.pulleyAxis) })
        : rf.maker ? t('sp_rinvio_maker', { code: rf.maker.code, mass: rf.maker.mass, axis: rf.maker.pulleyAxis, A: rf.maker.sheaveAxis })
          : t('sp_rinvio_ours', { axis: Math.round(rf.pulleyAxis), top: Math.round(rf.top) })}</p> : null}
      <p className="note">{t('sp_hint')}</p>
    </>
  ) : null;
  return (
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
      {panel ? (
        <label className="check">
          <input type="checkbox" id="auto-panel" checked={auto} onChange={(e) => panel.set(e.target.checked)} />
          <span>{t('rm_panelAuto')}</span>
        </label>
      ) : null}
      <div className="form-grid">
        {auto ? placed('panelWall', (P) => t(`wall_${P.panelWall}`)) : wall('panelWall')}
        {auto ? placed('panelAt', (P) => String(Math.round(P.panelAt))) : field('panelAt', 0, 20000)}
        {field('panelW', 200, 3000)}
        {field('panelD', 100, 1000)}
        {field('panelH', 500, 3000)}
      </div>
      {auto ? <p className="note">{t('rm_panelAutoHint')}</p> : null}
      {supportFields}
    </>
  );
}
