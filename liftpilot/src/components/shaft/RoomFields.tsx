'use client';

// The fields of a machine room over the shaft: its size and where the shaft lies in it, the height (and the ridge of a
// pitched roof), the slab, the door and the control panel, and what the machine stands on (its support: shims, a frame,
// beams that may stand clear of the floor, plates, a plinth or, with a diverting pulley, the bedplate that holds it —
// the pulley stays in the room, never in the shaft — with the profile and height). Shared by a whole design's options
// (RoomOptions) and a replacement's survey (components/room). A measure still to enter shows nothing (and a flat roof
// no ridge); the support's fields come with the machine, once the rest is entered. In a whole design the software may
// place the control panel: its wall and place are then shown as it put them, marked as such. With the support, the HEB
// beams on the shaft's walls it may stand on (HebFields), and which way the machine lies along the rope drops (its motor
// toward the counterweight, or turned round toward the car: the software's when not chosen). The pulley room of a
// machine below (scheme room) holds neither machine nor panel: its size, height, slab and door only. Round 52: each field
// with its «?»; the motor's side, which the survey rarely imposes, is marked `esperto` (hidden in «Semplice»).
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import type { HebTaken, RoomInputs } from '@/shaft';
import { KV_VERT } from '@/shaft/norme-vert';
import { PROFILE_NAMES } from '@/shaft/profiles';
import { BASI_ESISTENTI, SUPPORT_SCELTE, hasProfile, profileOf, supportHeight, supportLength, supportOf, type MachineSupport } from '@/shaft/support';
import type { MachineShape } from '@/shaft/machine-shape';
import type { RinvioFrame } from '@/shaft/rinvio';
import { mmOf } from '../blank';
import Campo, { ConAiuto } from './Campo';
import HebFields from './HebFields';

export interface RoomMachine {
  /** the machine's sheave and the axis the software takes on shims [mm], where its diverting pulley turns (null: none) */
  D: number;
  shimsAxis: number;
  shape?: MachineShape | null;
  rinvio?: RinvioFrame | null;
  /** the HEB beams on the shaft's walls as the derivation weighed them */
  heb?: HebTaken | null;
  /** where the derivation turned the machine: its motor toward the counterweight's drop (1) or the car's (−1) */
  turn?: 1 | -1;
  /** the machine the intervention keeps, on its existing base (round 46, B8) */
  kept?: boolean;
}

type Measure = Exclude<keyof RoomInputs, 'support' | 'heb' | 'motor'>;

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
  /** the pulley room of a machine below: no panel in it */
  pulley?: boolean;
}

type NumKey = Exclude<keyof RoomInputs, 'doorWall' | 'panelWall' | 'support' | 'heb' | 'motor'>;
const WALLS = ['front', 'rear', 'left', 'right'] as const;

export default function RoomFields({ R, put, machine, blank = () => false, choose = '—', panel, pulley = false }: Props) {
  const t = useTranslations('shaft'), tl = useTranslations('lift');
  const field = (key: NumKey, min: number, max: number) => (
    <Campo key={key} id={`bk-room-${key}`} nome={t(`rm_${key}`)} aiuto={testoAiuto(AIUTO, `rm_${key}`)} need={blank(key)}>
      <input id={`bk-room-${key}`} className="input num" type="number" inputMode="numeric" min={min} max={max} step={10}
        value={blank(key) || (key === 'ridge' && R.ridge === 0) ? '' : R[key]} aria-required={blank(key) || undefined}
        onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) put({ [key]: v }, [key]); }} />
    </Campo>
  );
  const wall = (key: 'doorWall' | 'panelWall') => (
    <Campo id={`bk-room-${key}`} nome={t(`rm_${key}`)} aiuto={testoAiuto(AIUTO, `rm_${key}`)} need={blank(key)}>
      <select id={`bk-room-${key}`} className="input" value={blank(key) ? '' : R[key]} aria-required={blank(key) || undefined}
        onChange={(e) => put({ [key]: e.target.value as RoomInputs[typeof key] }, [key])}>
        {blank(key) ? <option value="" disabled>{choose}</option> : null}
        {WALLS.map((w) => <option key={w} value={w}>{t(`wall_${w}`)}</option>)}
      </select>
    </Campo>
  );
  // the panel's wall and place as the software put them
  const placed = (key: 'panelWall' | 'panelAt', text: (P: NonNullable<RoomPanel['placed']>) => string) => (
    <Campo id={`bk-room-${key}`} nome={t(`rm_${key}`)} aiuto={testoAiuto(AIUTO, `rm_${key}`)}>
      <output id={`bk-room-${key}`} className="auto-value">{panel?.placed ? text(panel.placed) : '—'} <span className="badge">{tl('badge_auto')}</span></output>
    </Campo>
  );
  const auto = !!panel?.auto;
  const rf = machine?.rinvio ?? null, sup = supportOf(R, rf !== null), putSup = (patch: Partial<MachineSupport>): void => put({ support: { ...sup, ...patch } });
  const num = (id: string, label: string, aiuto: string | null, value: number, min: number, max: number, apply: (v: number) => void) => (
    <Campo id={id} nome={label} aiuto={aiuto}>
      <input id={id} className="input num" type="number" inputMode="numeric" min={min} max={max} step={5} value={Math.round(value)}
        onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) apply(v); }} />
    </Campo>
  );
  // the machine the intervention keeps (round 46, B8): its existing base, what it looks like only — no support, height,
  // HEB beams or pulley's frame to choose (src/lib/lift/kept.ts)
  const kept = !!machine?.kept, of = sup.kind === 'esistente' ? sup.of : undefined;
  const supportFields = machine ? (
    <>
      <h3>{t(kept ? 'kept_title' : 'sp_title')}</h3>
      {kept ? <p className="note" id="kept-base-note">{t('kept_note')}</p> : null}
      <div className="form-grid">
        {kept ? (
          <Campo id="bk-room-kept-of" nome={t('kept_of')} aiuto={testoAiuto(AIUTO, 'kept_of')}>
            <select id="bk-room-kept-of" className="input" value={of ?? ''} aria-describedby="kept-base-note" onChange={(e) => {
              const o = BASI_ESISTENTI.find((k) => k === e.target.value);
              put({ support: { kind: 'esistente', ...(o ? { of: o } : {}) } });
            }}>
              <option value="">{t('kept_of_none')}</option>
              {BASI_ESISTENTI.map((k) => <option key={k} value={k}>{t(`kept_of_${k}`)}</option>)}
            </select>
          </Campo>
        ) : (
          <Campo id="room-sp-kind" nome={t('sp_kind')} aiuto={testoAiuto(AIUTO, 'sp_kind')}>
            <select id="room-sp-kind" className="input" value={sup.kind} onChange={(e) => {
              const kind = SUPPORT_SCELTE.find((k) => k === e.target.value);
              // a new kind starts from its typical profile, height and length; the one the software takes is left unset
              if (kind) put({ support: kind === (rf ? 'rinvio' : 'shims') ? undefined : { kind } });
            }}>
              {SUPPORT_SCELTE.map((k) => <option key={k} value={k}>{t(`sp_${k}`)}</option>)}
            </select>
          </Campo>
        )}
        {!kept && hasProfile(sup) ? (
          <Campo id="room-sp-profile" nome={t('sp_profile')} aiuto={testoAiuto(AIUTO, 'sp_profile')}>
            <select id="room-sp-profile" className="input" value={profileOf(sup)} onChange={(e) => {
              const p = PROFILE_NAMES.find((x) => x === e.target.value);
              if (p) putSup({ profile: p, height: undefined });
            }}>
              {PROFILE_NAMES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
        ) : null}
        {kept || (sup.kind === 'rinvio' && rf?.maker) ? null
          : num('room-sp-height', t('sp_height'), testoAiuto(AIUTO, 'sp_height'), sup.kind === 'rinvio' && rf ? rf.top : supportHeight(sup, machine.D, machine.shimsAxis, machine.shape ?? null), 0, 3000, (v) => putSup({ height: v }))}
        {!kept && supportLength(sup, machine.D, machine.shape ?? null) !== null
          ? num('room-sp-length', t('sp_length'), testoAiuto(AIUTO, 'sp_length'), supportLength(sup, machine.D, machine.shape ?? null) ?? 0, 300, 5000, (v) => putSup({ length: v })) : null}
        {/* round 57: the frame or plinth moved along the drop line, the machine where its sheave is */}
        {!kept && supportLength(sup, machine.D, machine.shape ?? null) !== null
          ? num('room-sp-shift', t('sp_shift'), testoAiuto(AIUTO, 'sp_shift'), sup.shift ?? 0, -3000, 3000, (v) => putSup({ shift: v === 0 ? undefined : v })) : null}
        <Campo id="bk-room-motor" nome={t('rm_motor')} aiuto={testoAiuto(AIUTO, 'rm_motor')} className="esperto">
          <select id="bk-room-motor" className="input" value={R.motor ?? ''} onChange={(e) => {
            const v = e.target.value;
            put({ motor: v === 'cw' || v === 'car' ? v : undefined });
          }}>
            <option value="">{t('rm_motor_auto', { side: t(machine.turn === -1 ? 'rm_motor_car' : 'rm_motor_cw') })}</option>
            <option value="cw">{t('rm_motor_cw')}</option>
            <option value="car">{t('rm_motor_car')}</option>
          </select>
        </Campo>
      </div>
      <p className="note esperto">{t('rm_motor_hint')}</p>
      {rf && !kept ? <p className="note">{rf.on === 'stand' ? t('sp_rinvio_stand', { axis: Math.round(rf.pulleyAxis) })
        : rf.maker ? t('sp_rinvio_maker', { code: rf.maker.code, mass: rf.maker.mass, axis: rf.maker.pulleyAxis, A: rf.maker.sheaveAxis })
          : t('sp_rinvio_ours', { axis: Math.round(rf.pulleyAxis), top: Math.round(rf.top) })}</p> : null}
      {kept ? null : <p className="note">{t('sp_hint')}</p>}
      {kept ? null : <HebFields R={R} put={put} heb={machine.heb} deflector={rf !== null} />}
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
        {field('doorH', KV_VERT.pulleyDoorH, 3000)}
      </div>
      {panel && !pulley ? (
        <ConAiuto aiuto={testoAiuto(AIUTO, 'rm_panelAuto')} nome={t('rm_panelAuto')}>
          <label className="check">
            <input type="checkbox" id="auto-panel" checked={auto} onChange={(e) => panel.set(e.target.checked)} />
            <span>{t('rm_panelAuto')}</span>
          </label>
        </ConAiuto>
      ) : null}
      {pulley ? null : (
        <div className="form-grid">
          {auto ? placed('panelWall', (P) => t(`wall_${P.panelWall}`)) : wall('panelWall')}
          {auto ? placed('panelAt', (P) => String(Math.round(P.panelAt))) : field('panelAt', 0, 20000)}
          {field('panelW', 200, 3000)}
          {field('panelD', 100, 1000)}
          {field('panelH', 500, 3000)}
        </div>
      )}
      {auto && !pulley ? <p className="note">{t('rm_panelAutoHint')}</p> : null}
      {pulley ? null : supportFields}
    </>
  );
}
