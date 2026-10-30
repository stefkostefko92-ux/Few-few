// The levers of the Progetto's drawing for a check of the shaft or of the machine room (round 54): which inputs may put it
// right and which way (a sensitivity scan of the round-37 installations, then reviewed one check at a time: the floors'
// rises, the walls' thickness and what was surveyed in an existing building are never levers), what each costs, and the
// values of a list. A lever is an input an edit of the drawings sets (src/shaft/edit.ts), so «Applica» sets it as a
// dimension typed on the drawing would, with the same validation as the save. The checks of the machine, the ropes and
// the safety gear are «Calcolo argano»'s or the installation's data (`ALTROVE`). Pure.
import { checkedInputs } from '@/lib/shaft-edit';
import { GOVERNORS, HEB_PROFILES, PROFILE_NAMES, RAIL_TYPES, planValues, valueOf, withChoice, withValue, withoutFix, type Layout, type PlanKey, type ShaftCheckId, type ShaftInputs } from '@/shaft';
import type { Costo, Leva } from './tipi';

/** What an input costs to change; an input not here is never a lever. */
const COSTO: Readonly<Record<string, Costo>> = {
  ...Object.fromEntries(['carX', 'doorA', 'doorB', 'landA', 'landB', 'railY', 'dbg', 'cwLen', 'cwPos', 'bufX', 'bufY', 'bufSpan', 'cwBufPos', 'govX', 'govY'].map((k) => [`plan.${k}`, 'disegno'])),
  'cs.offset': 'disegno', 'cs.height': 'disegno', 'v.standW': 'disegno', 'v.standD': 'disegno', 'v.cwScreen': 'disegno', 'room.panelAt': 'disegno',
  ...Object.fromEntries(['plan.A', 'plan.B', 'plan.opLen', 'doorWidth', 'doorHeight', 'carDoorDepth', 'carWall', 'landingDepth', 'sillGap', 'railZone', 'cwCarGap', 'cwDepth', 'cwWallGap',
    'rearGap', 'shoeGap', 'cwRailGap', 'v.carH', 'v.carOutH', 'v.platform', 'v.opTop', 'v.frameTop', 'v.frameBelow', 'v.parapet', 'v.carBufferH', 'v.carBufferStroke',
    'v.carBufferBase', 'v.cwH', 'v.cwBufferH', 'v.cwBufferStroke', 'v.cwBufferBase', 'v.cwRunby', 'v.unlockZone', 'room.panelW', 'room.panelD', 'room.panelH', 'sup.height',
    'sup.length', 'rinvio.height', 'imb.left', 'imb.right', 'imb.top', 'frame.jamb', 'frame.head', 'frame.depth'].map((k) => [k, 'componente'])),
  ...Object.fromEntries(['W', 'D', 'v.pit', 'v.headroom', 'room.W', 'room.D', 'room.H', 'room.slab', 'room.doorAt', 'room.doorW', 'room.doorH',
    'below.W', 'below.D', 'below.H', 'below.doorAt', 'below.doorW', 'below.doorH'].map((k) => [k, 'edile'])),
  carRail: 'componente', cwRail: 'componente', 'v.topRefuge': 'componente', 'v.pitRefuge': 'componente', 'sup.profile': 'componente', 'heb.option': 'componente',
  governor: 'componente', 'v.carBufferType': 'componente', 'v.cwBufferType': 'componente', 'room.motor': 'componente',
};

/** What changing an input costs; null: it is never a lever. */
export const costoDi = (key: string): Costo | null => COSTO[key] ?? null;

const CAR_FIT = ['plan.B-', 'plan.A-', 'carWall-', 'carDoorDepth-', 'landingDepth-', 'sillGap-', 'cwDepth-', 'cwCarGap-', 'cwWallGap-', 'rearGap-', 'D+', 'W+'];
const TOP = ['v.headroom+', 'v.carOutH-', 'v.cwRunby-', 'v.cwBufferH-', 'v.cwBufferStroke-'];
const ROOM_FREE = ['room.motor', 'room.panelAt±', 'room.panelD-', 'room.W+', 'room.D+'];

/** The levers of each check, the way that helps: `+` up, `-` down, `±` either; `*` every distance set by hand given
 *  back. A check not here tries its group's (GRUPPO). */
const CATALOGO: Partial<Readonly<Record<string, readonly string[]>>> = {
  v_fit: CAR_FIT, v_area: ['plan.A-', 'plan.B-'],
  v_acc_car: ['plan.B+', 'plan.A+', ...CAR_FIT.slice(2)], v_acc_door: ['doorWidth+'], v_acc_side: ['plan.A±', 'plan.B+', 'doorWidth±', 'D+', 'W±'],
  v_call: ['cs.height±'], v_door: ['plan.doorA±', 'plan.landA±', 'plan.carX±', 'plan.opLen-', 'doorWidth-', 'W+'],
  v_door2: ['plan.doorB±', 'plan.landB±', 'plan.opLen-', 'doorWidth-', 'D+', 'W+'], v_land: ['plan.landA±'], v_land2: ['plan.landB±'],
  v_op: ['plan.opLen-', 'plan.doorA±', 'plan.doorB±', 'doorWidth-'], v_wall: ['sillGap-', 'landingDepth-'], v_sill: ['sillGap-'],
  v_cw: ['cwCarGap+', 'plan.carX±', 'plan.cwPos±', 'plan.A-', 'plan.B-', 'cwDepth-', 'cwWallGap-'], v_cwlen: ['plan.cwLen+', 'plan.B-', 'rearGap-', 'D+'],
  v_place: ['*', 'plan.A-', 'plan.B-', 'plan.carX±', 'plan.cwPos±', 'plan.cwLen-'], v_doorcar: ['*', 'plan.doorA±', 'plan.doorB±', 'plan.A+'],
  v_buffer: ['plan.bufX±', 'plan.bufY±', 'plan.bufSpan±', 'plan.cwBufPos±', 'plan.B+', 'W+'],
  v_staffa: ['plan.cwPos±', 'plan.cwLen±', 'cwWallGap±', 'cwDepth±', 'plan.railY-', 'D±'], v_telaio: ['frame.depth-', 'frame.jamb±', 'landingDepth+'],
  v_head: ['plan.carX±', 'plan.cwPos±', 'plan.A-', 'plan.B-'], v_gov: ['plan.govX±', 'plan.govY±', 'plan.carX±'], v_govrail: ['plan.govY±'], v_govdd: ['governor'],
  h_refuge: [...TOP, 'v.topRefuge'], h_refuge_rig: [...TOP, 'v.topRefuge'], h_clear: [...TOP, 'v.opTop-', 'v.parapet-'],
  h_top: ['v.headroom+', 'v.frameTop-', 'v.cwRunby-', 'v.cwBufferStroke-'], h_cross: ['v.headroom+', 'v.frameTop-', 'v.cwRunby-', 'v.cwBufferStroke-'],
  h_guide: ['v.headroom+', 'v.frameTop-', 'v.cwRunby-', 'v.cwBufferH-', 'v.cwBufferStroke-'], h_hung: ['v.headroom+', 'v.carOutH-', 'v.frameTop-'],
  h_parapet: ['v.parapet+', 'plan.A+', 'plan.B+'], h_stand: ['plan.B+', 'plan.railY±', 'v.standW-', 'v.standD-', 'D+'],
  h_stand_rig: ['plan.B+', 'plan.railY±', 'v.standW-', 'v.standD-', 'D+'], h_door: ['doorHeight+'], h_staffe: ['doorHeight-', 'imb.top-', 'imb.left-', 'imb.right-'],
  h_car: ['v.carH+'], h_cw: ['v.headroom+', 'v.cwH-', 'v.cwRunby-', 'v.cwBufferH-', 'v.cwBufferBase-', 'v.carBufferH+', 'v.carBufferBase+', 'v.frameBelow+'],
  h_cwgap: ['v.cwRunby-', 'v.cwBufferH+', 'v.cwBufferBase+'],
  p_refuge: ['v.pit+', 'v.carBufferH+', 'v.carBufferBase+', 'v.carBufferStroke-', 'v.pitRefuge'], p_apron: ['v.carBufferH+', 'v.carBufferBase+', 'v.frameBelow+', 'v.carBufferStroke-'],
  // p_toe: the unlocking zone is the door supplier's datum, no lever (rimedi.hint_p_toe); p_screenlo, p_screenw: information only
  p_screen: ['v.cwScreen+'], p_toe: [], p_screenlo: [], p_screenw: [],
  b_runby: ['v.cwRunby±', 'v.pit+', 'v.carBufferH-', 'v.carBufferBase-', 'v.frameBelow-'], b_type: ['v.carBufferType', 'v.cwBufferType'],
  b_car: ['v.carBufferStroke+', 'v.carBufferType'], b_cw: ['v.cwBufferStroke+', 'v.cwBufferType'],
  m_height: ['room.H+'], m_hexist: ['room.H+'], m_pheight: ['room.H+'], m_pabove: ['room.H+'], m_door: ['room.doorH+', 'room.doorW+'], m_pdoor: ['room.doorH+', 'room.doorW+'],
  m_panel: [...ROOM_FREE, 'room.doorAt±'], m_free: ROOM_FREE, m_quadro: ['room.panelAt±', 'room.W+', 'room.D+'], m_wheel: ['room.panelAt±', 'room.W+', 'room.D+'],
  m_route: ['room.doorAt±', 'room.doorW+', 'room.panelAt±', 'room.panelD-', 'room.W+', 'room.D+'],
  m_gov: ['plan.govX±', 'plan.govY±', 'room.panelAt±', 'room.W+', 'room.D+'], m_govfree: ['plan.govX±', 'plan.govY±', 'room.panelAt±', 'room.W+', 'room.D+'],
  m_fit: ['room.motor', 'room.W+', 'room.D+', 'room.H+', 'sup.height-'], m_above: ['room.H+', 'sup.height-'],
  m_beam: ['sup.profile', 'sup.length-'], m_beamf: ['sup.profile', 'sup.length-'], m_base: ['sup.profile', 'sup.length+'], m_bedplate: ['sup.length+'],
  m_beamwall: ['sup.length±'], m_heb: ['heb.option'], m_hebf: ['heb.option'], m_hebfeet: ['heb.option'],
  gr_stress: ['carRail'], gr_flange: ['carRail'], gr_defl: ['carRail'], gr_cw: ['cwRail'],
} satisfies Partial<Record<ShaftCheckId, readonly string[]>>;

/** A check's group, by its prefix: the levers it tries when the catalogue names none. */
const GRUPPO: Readonly<Record<string, readonly string[]>> = {
  v: ['*', 'plan.A±', 'plan.B±', 'plan.carX±', 'plan.cwPos±', 'plan.railY±', 'cwDepth±', 'cwWallGap±', 'W+', 'D+'],
  h: [...TOP, 'v.frameTop-', 'v.opTop-'],
  p: ['v.pit+', 'v.carBufferH±', 'v.carBufferBase±', 'v.frameBelow±', 'v.cwScreen±'],
  b: ['v.carBufferStroke+', 'v.cwBufferStroke+', 'v.cwRunby±', 'v.pit+'],
  m: [...ROOM_FREE, 'room.H+', 'room.doorAt±', 'sup.length±', 'plan.govX±', 'plan.govY±'],
};

/** The checks a drawing of the shaft cannot put right: the ropes, the loads' ratio (the machine and its ropes are
 *  «Calcolo argano»'s, as an existing sling's parts and loads), the safety gear (the installation's data), the existing
 *  falls the calculation measured, the emergency doors (the building's floors), a niche (surveyed). */
export const ALTROVE: Readonly<Partial<Record<string, 'calcolo' | 'impianto' | 'edificio'>>> = {
  tr_d1: 'calcolo', tr_d2: 'calcolo', fm_z: 'calcolo', fm_d1: 'calcolo', fm_d2: 'calcolo', fm_comp: 'calcolo', m_calata: 'calcolo', m_rinvio: 'calcolo',
  sg_type: 'impianto', sg_cw: 'impianto', sl_frame: 'calcolo', v_emerg: 'edificio', v_niche: 'edificio',
} satisfies Partial<Record<ShaftCheckId, 'calcolo' | 'impianto' | 'edificio'>>;

/** The levers the catalogue and the groups name that are no input with a cost (the tests keep it empty). */
export const leveSenzaCosto = (): string[] => [...Object.values(CATALOGO), ...Object.values(GRUPPO)].flatMap((l) => l ?? [])
  .map((w) => w.replace(/[+\-±]$/, '')).filter((k) => k !== '*' && !COSTO[k]);

/** The levers of check `id` as written in the catalogue (or its group's). */
export const leveDi = (id: string): readonly string[] => CATALOGO[id] ?? GRUPPO[id.split('_')[0] ?? ''] ?? [];

const BUFFERS = ['spring', 'pu', 'oil'] as const;
const LISTE: Readonly<Record<string, (I: ShaftInputs) => { da: string; ids: readonly string[]; label?: (id: string) => string }>> = {
  carRail: (I) => ({ da: I.carRail, ids: RAIL_TYPES }),
  cwRail: (I) => ({ da: I.cwRail, ids: RAIL_TYPES }),
  'v.topRefuge': (I) => ({ da: String(I.vertical.topRefuge), ids: ['1', '2'], label: (id) => `refuge_${id}` }),
  'v.pitRefuge': (I) => ({ da: String(I.vertical.pitRefuge), ids: ['1', '2', '3'], label: (id) => `refuge_${id}` }),
  'v.carBufferType': (I) => ({ da: I.vertical.carBufferType ?? 'spring', ids: BUFFERS, label: (id) => `bt_${id}` }),
  'v.cwBufferType': (I) => ({ da: I.vertical.cwBufferType ?? 'spring', ids: BUFFERS, label: (id) => `bt_${id}` }),
  'sup.profile': (I) => ({ da: I.room?.support?.profile ?? '', ids: I.room ? PROFILE_NAMES : [] }),
  // the beams on the shaft's walls: a profile and its direction (heb.ts withHebChoice), once the drawing has them
  'heb.option': (I) => {
    const h = I.room?.heb;
    return { da: h?.profile && h.dir ? `${h.dir}:${h.profile}` : '', ids: h ? (['x', 'y'] as const).flatMap((d) => HEB_PROFILES.map((x) => `${d}:${x}`)) : [] };
  },
  governor: (I) => ({ da: I.governor ?? '', ids: GOVERNORS.map((g) => g.model) }),
  'room.motor': (I) => ({ da: I.room?.motor ?? '', ids: I.room ? ['cw', 'car'] : [], label: (id) => `rm_motor_${id}` }),
};

/** The inputs with an entry of a list, validated as the save validates them; null: refused. */
function conScelta(I: ShaftInputs, key: string, id: string): ShaftInputs | null {
  const V = I.vertical, buffer = BUFFERS.find((b) => b === id), motor = id === 'cw' ? 'cw' as const : id === 'car' ? 'car' as const : null;
  const next = key === 'v.carBufferType' ? (buffer ? { ...I, vertical: { ...V, carBufferType: buffer } } : null)
    : key === 'v.cwBufferType' ? (buffer ? { ...I, vertical: { ...V, cwBufferType: buffer } } : null)
      : key === 'governor' ? { ...I, governor: id }
        : key === 'room.motor' ? (I.room && motor ? { ...I, room: { ...I.room, motor } } : null)
          : withChoice(I, key, key === 'v.topRefuge' || key === 'v.pitRefuge' ? Number(id) : id);
  const r = next && checkedInputs(next, I);
  return r && r.ok ? r.inputs : null;
}

/** How far the search goes from a value, and its smallest step [mm]: a size or a distance up to 2 m, a gap 300 mm. */
const passoDi = (da: number): number => (Math.abs(da) < 300 ? 5 : 10);

/** The levers of check `id` on the drawn shaft `I` (its layout `L`), each with its value now; `label(key)` names a list's
 *  entry. An input the drawing does not have (no machine room, no value to change) is left out. */
export function leveVano(id: string, I: ShaftInputs, L: Layout, label: (key: string) => string): Leva<ShaftInputs>[] {
  const fixed = I.plan ?? {}, plan = planValues(L);
  return leveDi(id).flatMap((w): Leva<ShaftInputs>[] => {
    if (w === '*') {
      return (Object.keys(fixed) as PlanKey[]).filter((k) => fixed[k] !== undefined).map((k) => ({
        tipo: 'togli', key: `plan.${k}`, costo: 'disegno', da: fixed[k] ?? 0, set: (J: ShaftInputs) => withoutFix(J, k),
      }));
    }
    const m = /^(.*?)([+\-±])?$/.exec(w), key = m?.[1] ?? w, costo = COSTO[key];
    if (!costo) return [];
    const lista = LISTE[key]?.(I);
    if (lista) {
      if (!lista.ids.length) return [];
      return [{ tipo: 'scelta', key, costo, da: lista.da, opzioni: lista.ids.map((x) => ({ id: x, label: lista.label ? label(lista.label(x)) : x })), set: (J, x) => conScelta(J, key, x) }];
    }
    const da = valueOf(I, key) ?? (key.startsWith('plan.') ? plan[key.slice(5) as PlanKey] ?? null : null);
    if (da === null) return [];
    const sign = m?.[2], dir = sign === '+' ? 1 : sign === '-' ? -1 : 0, span = key.startsWith('room.') || key === 'W' || key === 'D' ? 1500 : Math.abs(da) < 300 ? 300 : 2000;
    return [{
      tipo: 'num', key, costo, da, dir, passo: passoDi(da), min: Math.max(0, da - span), max: da + span,
      set: (J, x) => {
        const next = withValue(J, key, Math.round(x)), r = next && checkedInputs(next, J);
        return r && r.ok ? r.inputs : null;
      },
    }];
  });
}
