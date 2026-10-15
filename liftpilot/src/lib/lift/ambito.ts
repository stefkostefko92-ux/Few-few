// Which parts each check concerns (round 46: out of collaudo.ts, which re-exports it): replacing or changing any of them
// brings the check into the acceptance test of a modification under UNI 10411 (collaudo.ts underNorma). The table is
// the software's reading of UNI 10411-1/-11:2024 and UNI EN 81-20/50:2020 (registry impianto.collaudo), to be confirmed
// by the engineer on the standard in force; the parts that bring a check under UNI 10411-1 only (AMBITO_10411_1), the
// checks of one part of UNI 10411 only and the checks of the data, which apply whatever the intervention replaces.
// Round 46 (B4) closed the gaps: the speed in the traction and the ropes (UNI 10411-1 15.8 with 14.1 and D.2, -11 15 d)),
// the travel in the ropes' safety (-1 16 h), 17.2) and in the spaces of the headroom and the pit (-1 16 j), -11 16 i)),
// the rails with the speed and the travel (-1 15.5, 15.6, 16 g), -11 15 j), 16 f)), the counterweight's rails with the
// load too (-1 6.5, 6.13, 15.7, 16 a), -11 6.5, 15 k), 16 f)), the load in the safety gears and the buffers (-1 6.1, 6.4,
// 6.6, 6.14, -11 6.1, 6.4, 6.6). Round 46 (B7) added the optional parts of a modernisation: the safety gear with its
// rails (-1 6.6, 6.7, 15.3, 15.6; -11 6.6, 6.7), the machine room with its spaces and ways (-1 and -11, 8), the car
// doors from hinged to sliding with the car's area, the refuge on its roof and the apron (-1 and -11, 13.1); the ACOP
// and UCM protections and the alarm bring obligations only (obblighi.ts). The clearance over the new parts on the car
// roof stays to UNI EN 81-20 (h_clear; owner's decision Q5). Pure.
import type { CheckId } from '@/calc/types';
import type { ShaftCheckId } from '@/shaft';
import type { Parte } from './collaudo';

const TRACTION: readonly Parte[] = ['machine', 'ropes', 'car', 'cw', 'load', 'travel', 'speed'];
const ROPES: readonly Parte[] = ['machine', 'ropes', 'load'];
const DRIVE: readonly Parte[] = ['machine', 'speed', 'load', 'car', 'cw', 'travel'];
const HEAD: readonly Parte[] = ['car', 'sling', 'cw', 'buffers', 'speed', 'rails', 'travel'];
const PIT: readonly Parte[] = ['car', 'sling', 'buffers', 'speed', 'travel'];
// the rails with the car, its frame and its rated load, the speed and the added travel
const RAILS: readonly Parte[] = ['rails', 'car', 'sling', 'load', 'speed', 'travel'];
const BUFFERS: readonly Parte[] = ['buffers', 'speed', 'car', 'cw', 'load'];
const DOORS: readonly Parte[] = ['landingDoors', 'carDoors'];
// the car's rails under a new safety gear (UNI 10411-1 15.6: the rails its type certificate names)
const RAILS_SG: readonly Parte[] = [...RAILS, 'safetyGear'];

/** The parts each check concerns: replacing or changing any of them brings the check into the acceptance test. */
export const AMBITO_VERIFICHE: Readonly<Record<CheckId | ShaftCheckId, readonly Parte[]>> = {
  // the machine's checks: traction (UNI EN 81-50, 5.11), ropes and grooves, drive, shaft, brake, rescue
  tr_load: TRACTION, tr_dn: TRACTION, tr_up: TRACTION, tr_real: TRACTION, tr_stall: TRACTION,
  r_dd: ['machine', 'ropes'], r_ddp: ['machine', 'ropes'], r_nd: ROPES, g_geom: ['machine', 'ropes'], r_sfa: [...ROPES, 'car', 'cw', 'speed', 'travel'],
  d_pst: DRIVE, d_ratio: DRIVE, d_mp: DRIVE, s_shaft: ['machine', 'ropes', 'car', 'cw', 'load', 'travel'],
  b_sets: ['machine'], b_all: DRIVE, b_one: DRIVE, b_up: DRIVE, b_amax: DRIVE,
  s_force: ['machine', 'car', 'cw', 'load'], s_uplift: ['machine', 'car', 'cw', 'load'], tr_msr1: TRACTION, r_two: ROPES,
  v_comp: ['machine', 'ropes', 'speed'], g_retain: ['machine', 'ropes'], s_fa: ['machine', 'car', 'cw', 'load'], s_gravity: ['machine'],
  g_press: [...ROPES, 'car', 'cw', 'speed'],
  // the shaft in plan: the car and its rated load, the doors, the counterweight and the rails
  v_fit: ['car'], v_area: ['car', 'load', 'slidingDoors'], v_acc_car: ['car'], v_acc_c: ['car'], v_call: ['controller'], v_acc_door: DOORS, v_acc_side: ['car', ...DOORS],
  v_door: ['landingDoors'], v_door2: ['landingDoors'], v_land: DOORS, v_land2: DOORS, v_op: ['carDoors'], v_wall: ['car', ...DOORS], v_sill: ['car', ...DOORS],
  v_cw: ['car', 'cw', 'rails'], v_cwlen: ['cw'], v_place: ['car', 'cw', 'rails', ...DOORS], v_doorcar: ['car', ...DOORS],
  v_buffer: ['buffers'], v_niche: ['cw'], v_staffa: ['cw', 'rails'], v_telaio: ['landingDoors'], v_head: ['car', 'cw', 'rails'],
  v_gov: ['governor', 'car', 'rails', 'sling'], v_govrail: ['governor', 'sling'], v_govdd: ['governor'],
  // the headroom and the pit: their spaces follow the car, its frame, the buffers and the speed
  // the refuge on the car roof with the car doors made sliding (-1/-11 13.1.3 a)); the clearance over the new parts stays
  // HEAD's (EN 81-20, owner's decision Q5)
  h_refuge: [...HEAD, 'slidingDoors'], h_clear: HEAD, h_top: [...HEAD, 'machine'], h_parapet: ['car'], h_stand: ['car'], h_cross: ['car', 'sling'], h_door: DOORS, h_staffe: DOORS, h_car: ['car'], h_cw: HEAD, h_guide: HEAD,
  p_refuge: PIT, p_apron: [...PIT, 'carDoors', 'slidingDoors'], p_screen: ['cw'],
  // the shaft's details (round 36): the emergency doors follow the floors served, the plate under the sills the landing doors,
  // the screen the counterweight, the sign's clearance the headroom's spaces
  v_emerg: ['landingDoors', 'travel'], p_toe: ['landingDoors'], p_screenlo: ['cw'], p_screenw: ['cw'], h_cwgap: [...HEAD, 'machine'],
  b_runby: BUFFERS, b_type: ['buffers', 'speed'], b_car: ['buffers', 'speed', 'load'], b_cw: ['buffers', 'speed', 'load'],
  // the machine room is the building's, unless the modernisation modifies it (round 46, the part 'room': UNI
  // 10411-1/-11:2024, 8); the space in front of the panel follows a new controller or a new machine that stands in it
  // (9.2: UNI EN 81-20 5.2.6.3 round the equipment replaced); the beams under a new machine
  m_height: ['room'], m_panel: ['controller', 'machine', 'room'], m_door: ['room'], m_beam: ['machine'], m_beamf: ['machine'], m_beamwall: ['machine'], m_rinvio: ['machine'], m_bedplate: ['machine'], m_base: ['machine'], m_fit: ['machine'], m_runs: ['machine', 'ropes'], m_stand: ['machine'], m_free: ['machine', 'room'], m_calata: ['machine'],
  // the panel among what stands on the floor and the ways to the free areas follow a new controller or a new machine
  m_quadro: ['controller', 'machine'], m_route: ['controller', 'machine', 'room'],
  // the pulley room of a machine below is the building's (unless modified: 'room', 8); the free height over its pulleys
  // follows a new machine's pulleys
  m_pheight: ['room'], m_pdoor: ['room'], m_pabove: ['machine'], m_gov: ['governor', 'machine', 'controller'], m_govfree: ['governor', 'machine', 'controller'],
  // the HEB beams on the shaft's walls under a new machine
  m_heb: ['machine'], m_hebf: ['machine'], m_hebfeet: ['machine'], m_hebrope: ['machine'], m_hebkerb: ['machine'], m_hebwall: ['machine'],
  // over the new machine's unguarded rotating parts, the free area at its handwheel (UNI 10411-1/-11:2024, 9.2: EN 81-20
  // 5.2.6.3 round the machine replaced); an existing room's height under 2,0 m with a new machine (UNI 10411-1 only)
  m_above: ['machine'], m_wheel: ['machine'], m_hexist: ['machine'], m_holes: ['machine'],
  // the existing governor's ropes down into the shaft: a check of the survey's data (VERIFICHE_DATI)
  m_govdrop: ['governor'],
  // the car's rails under the safety gear and in use (sheet 1 of the drawing set); the safety gear is on the sling, or
  // replaced (round 46, 'safetyGear')
  gr_stress: RAILS_SG, gr_flange: RAILS_SG, gr_defl: RAILS_SG, sg_type: ['sling', 'speed', 'load', 'safetyGear'],
  // the car under a machine below's hung pulleys as h_top; the counterweight's safety gear over a space under the shaft
  // goes with the counterweight and its rails
  h_hung: [...HEAD, 'machine'], sg_cw: ['cw', 'rails', 'speed', 'load', 'safetyGear'],
  // the counterweight's rails under its safety gear's grip go with the counterweight and its rails, its load, the speed
  // and the added travel
  gr_cw: ['cw', 'rails', 'load', 'speed', 'travel', 'safetyGear'],
  // the refuge on the car roof under what the rope rig hangs under the slab (head.ts, in place of h_refuge and h_stand):
  // the machine's pulleys and dead ends, so a new machine brings it in as it does h_hung; the car doors made sliding as
  // h_refuge, which it takes the place of
  h_refuge_rig: [...HEAD, 'machine', 'slidingDoors'], h_stand_rig: [...HEAD, 'machine'],
  // the existing sling under a new car or a new rated load (arcata.ts: emitted when T* increases or is not known)
  sl_frame: ['car', 'load'],
};

/** The parts that bring a check into the test under UNI 10411-1 only, besides AMBITO_VERIFICHE: the counterweight's
 *  screen in the pit with the load, the speed or the travel changed (-1 6.13, 15.7, 16 a) with UNI EN 81-20 5.2.5.5.1;
 *  -11 asks none), the brake's two sets with a new controller (-1 11.1.4, without UCM to 5.6.7; -11 11.1.3 asks only
 *  that it be watched). */
export const AMBITO_10411_1: Readonly<Partial<Record<CheckId | ShaftCheckId, readonly Parte[]>>> = {
  p_screen: ['load', 'speed', 'travel'], p_screenlo: ['load', 'speed', 'travel'], p_screenw: ['load', 'speed', 'travel'],
  b_sets: ['controller'], b_one: ['controller'],
};

/** Checks of one part of UNI 10411 only: the height of an existing room under 2,0 m takes the measures of UNI EN 81-21,
 *  5.9 under UNI 10411-1:2024, 9.2; under UNI 10411-11 the existing height stays, a new lift has its own (m_height). */
export const SOLO_10411_1: readonly ShaftCheckId[] = ['m_hexist'];

/** Checks of the data, not of a part: the distances set by hand on the plan keep every part in its place
 *  (layout.ts); the existing governor surveyed over the shaft it drops its ropes into (survey-site.ts, round 37). They
 *  apply to every test, whatever the intervention replaces. */
export const VERIFICHE_DATI: readonly ShaftCheckId[] = ['v_place', 'v_doorcar', 'm_govdrop'];
