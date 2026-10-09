// Values of sheet 1, written: characteristics and specifications of the installation from the calculation, the shaft
// design and the data of the installation; the analysis of the loads on the machine; P1…P9; the forces on the rails;
// the electrical supply; the title block. What the design knows comes from it (doors, frame, rails, brackets, governor,
// buffers, the machine's mass); the parts the acceptance test leaves in place are written as existing. What nobody
// entered prints as a dash; the car weight estimated by the software says so, with a note. The calculation and the
// design must describe the same lift, and the parts of the car mass the car mass: where they disagree the set carries a
// warning (shown with the set).
import appIt from '../../../messages/it.json';
import type { Analysis } from '../present/analysis';
import { makeFmt } from '../present/tr';
import { belowChecks, belowRoomOf } from '../lift/below-checks';
import { headTopChecks } from '../lift/head';
import { pulleyRoomOf, withRig } from '../lift/shaft-rig';
import { carSideStatic, governorRopeLength, ropeCut, supportChecks } from '../lift/support';
import { layoutRigLength } from '../lift/rope';
import { massModelOf } from '../lift/known';
import { hebRows } from './heb-rows';
import { isUpperLimit, mergeChecks, shownValue } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import { existingRoomCheck } from '@/shaft/room-above';
import { slingCheck } from '../lift/arcata';
import { carichiOf } from '../lift/modifica';
import { bracketCount, maxBracketSpan, railSpan } from '@/shaft/brackets';
import { cwGapOver } from '@/shaft/cw-gap';
import { bufferType } from '@/shaft/buffers';
import { govSize } from '@/shaft/governor';
import { hasImbotti, imbottiOf } from '@/shaft/imbotti';
import type { BufferType } from '@/shaft/vertical';
import { railLabel, type RailType } from '@/shaft/rails';
import { section } from '@/shaft/section';
import type { DataSheet, Row } from './datasheet';
import { railChecks } from './rail-check';
import type { TavoleInput } from './input';
import { GOVERNOR_LOAD_UNSET, loadNames } from './loads';
import { refsText, titleOf } from './title-data';
import { sheetLoads, sheetRails, supportRows } from './sheet-loads';
import { cwGearChecks, cwGearOf, cwGearRow } from './cw-gear';
import { hebFor, hebNote, hookRow, reactionRows } from './room-rows';
import { roomGeo } from '@/shaft/machine-room';
import { governorRopes, shaftUnder } from '@/shaft/room-site';
import { belowGeoOf, machineOf, machineText } from './views';
import { clientNotes, estimateNote, railNote, safetyGearNote, spaceLegend } from './notes';
import { shaftDetailText } from './notes-vano';
import { NORMA_SIGLA, ambitoOf, collaudoOf, partKept, ropesKept } from '../lift/collaudo';
import { collaudoNote } from '../report/collaudo';

/** The buffers by type as the data sheet writes them: the car's (plural) and the counterweight's. */
const BUFFER_TEXT: Readonly<Record<BufferType, readonly [string, string]>> = {
  spring: ['MOLLE', 'MOLLA'], pu: ['TAMPONI IN POLIURETANO', 'TAMPONE IN POLIURETANO'], oil: ['IDRAULICI', 'IDRAULICO'],
};

const fmt = makeFmt('it-IT');
const dec = (x: number): number => (Number.isInteger(x) ? 0 : Math.abs(x * 10 - Math.round(x * 10)) < 1e-9 ? 1 : 2);
const num = (x: number | null | undefined): string => (x == null ? '—' : fmt(x, dec(x)));
const txt = (s: string | undefined, fallback = '—'): string => (s && s.trim() ? s.trim() : fallback);

/** A value the calculation and the shaft design give differently; or the car mass of the calculation and the sum of
 *  its parts in the data of the installation (`shaft`). */
export interface Mismatch {
  what: 'travel' | 'speed' | 'load' | 'carMass';
  calc: number;
  shaft: number;
}

/** The sum of the parts of the car mass, when all four are given. */
const carParts = (Pl: TavoleInput['plant']): number | null =>
  Pl.massShell != null && Pl.massFloor != null && Pl.massDoors != null && Pl.massFrame != null ? Pl.massShell + Pl.massFloor + Pl.massDoors + Pl.massFrame : null;

export interface DataSheetResult {
  sheet: DataSheet;
  warnings: Mismatch[];
  /** the clearance on the counterweight's sign the checks give [mm] (cw-gap.ts): section A-A writes it on the screen */
  cwGap: number | null;
  /** for the sheet of the rails: the thrusts on a car rail written [daN], whether the rails stay as they are */
  rails: { fx: string; fy: string; kept: boolean };
}

export function dataSheet(x: TavoleInput, a: Analysis, pages: number): DataSheetResult {
  const { ctx, res } = a, { I, N } = ctx, L = x.layout, Pl = x.plant, V = L.inputs.vertical, S = section(L), pEstimate = x.marks?.pEstimate ?? false;
  // the acceptance test of the lift design (without one, the software's default for the intervention)
  const C = x.marks?.collaudo ?? collaudoOf({ context: I.context });
  const warnings: Mismatch[] = [];
  const travel = S.top / 1000;
  if (Math.abs(travel - I.H) > 0.05) warnings.push({ what: 'travel', calc: I.H, shaft: travel });
  if (Math.abs(V.v - I.v) > 0.005) warnings.push({ what: 'speed', calc: I.v, shaft: V.v });
  if (L.Q !== I.Q) warnings.push({ what: 'load', calc: I.Q, shaft: L.Q });
  const parts = carParts(Pl);
  if (parts !== null && Math.abs(parts - I.P) > 0.5) warnings.push({ what: 'carMass', calc: I.P, shaft: parts });
  // the parts the intervention leaves in place (a lift tested as new, UNI EN 81-20/50: none)
  const kept = (p: (typeof C.parti)[number]): boolean => partKept(C, p);

  // stops and landing doors actually served
  const served = (f: (typeof V.floors)[number]): number => [...f.door].filter((s) => L.doors.some((d) => d.side === s)).length;
  const services = V.floors.reduce((n, f) => n + served(f), 0);
  const access = L.inputs.entrances === 'one' ? '1 ACCESSO' : L.inputs.entrances === 'opposite' ? '2 ACCESSI OPPOSTI' : '2 ACCESSI ADIACENTI A 90°';
  const doors = L.inputs.door === 'T2' ? 'AUTOMATICHE TELESCOPICHE 2 ANTE' : 'AUTOMATICHE CENTRALI 2 ANTE';
  const base: Row[] = [
    ['NORMATIVA DI RIFERIMENTO', '', C.norma === 'en81' ? 'UNI EN 81-20/50:2020' : NORMA_SIGLA[C.norma]],
    ['PORTATA', 'kg', fmt(I.Q, 0)],
    ['PERSONE', 'N°', fmt(L.persons, 0)],
    ['CORSA', 'm', fmt(travel, 2)],
    ['VELOCITÀ', 'm/s', fmt(I.v, 2)],
    ['FERMATE - SERVIZI', 'N°-N°', `${V.floors.length} - ${services}`],
    ['ACCESSI DI CABINA', 'N°', access],
    ['MANOVRA', 'tipo', txt(Pl.control)],
    ['VANO', 'tipo', txt(Pl.shaft)],
    ['TRAZIONE', 'tipo', `ELETTRICA ${I.r}:1`],
    ['BILANCIAMENTO', '%', fmt(res.k * 100, 0)],
    ['SUPERFICIE CABINA', 'm²', fmt(L.area, 2)],
    ['RIVESTIMENTO CABINA', 'tipo', txt(Pl.carFinish)],
    ['PORTE DI PIANO', 'tipo', kept('landingDoors') ? 'ESISTENTI' : doors],
    ['PORTE DI CABINA', 'tipo', kept('carDoors') ? 'ESISTENTI' : doors],
    // the linings of an old opening between the marbles round a smaller new door
    ...(hasImbotti(L.inputs) ? [((m) => ['IMBOTTI PORTE DI PIANO (SX - DX - SUP)', 'mm', `${m.left} - ${m.right} - ${m.top}`] as Row)(imbottiOf(L.inputs))] : []),
    // the landing doors' own frame
    ...(L.inputs.frame ? [((f) => ['TELAIO PORTE DI PIANO (MONT. - FRONT. - SPESS.)', 'mm', `${f.jamb} - ${f.head} - ${f.depth}`] as Row)(L.inputs.frame)] : []),
  ];

  // rails from the pit floor to under the slab, new or existing as the acceptance test says; brackets one every pitch
  // (the declared one or the rule's) plus the first and the last of each rail (registry guide.staffe); each rope at its
  // cut length on the design's rope rig (registry impianto.funi.taglio: the bill and the draft order take the same; the
  // ropes the intervention keeps are existing — collaudo.ts ropesKept —, their mass in the loads at that length) and the governor rope
  // (estimates); the governor the design takes (the one chosen, else by the speed)
  const R = sheetRails(L, I.P, I.Q, Pl), railLen = R.railLen, oldRails = kept('rails');
  const rails = (t: RailType): string => `${oldRails ? 'ESISTENTI ' : ''}${railLabel(t)}`;
  const brackets = (pitch: number | undefined): string => (oldRails ? 'ESISTENTI' : `${2 * bracketCount(railLen * 1000, pitch ?? KV_VERT.bracketPitch)}`);
  // the longest interval between two brackets actually mounted (brackets.ts), the one figure the sheet gives for their
  // spacing: the car's is the l of the car rails' check below (UNI EN 81-50:2020, 5.10; sheet-loads.ts sheetRails)
  const [z0, z1] = railSpan(S), spanCar = R.span, spanCw = maxBracketSpan(z0, z1, L.inputs.cwRail, Pl.cwBracketPitch);
  const gov = govSize(V.v, L.inputs.governor), oldGov = kept('governor');
  const ropeLen = ropeCut(I, layoutRigLength(L, a, x.marks?.catalog ?? null, x.marks?.bottom ?? null)), oldRopes = ropesKept(C, x.values);
  // the governor's rope up to the governor: in the room over the shaft (with a machine below, the pulley room), else on
  // its bracket under the ceiling (registry limitatore.vano)
  const room = L.inputs.room, scheme = I.layout === 'bottom' ? x.marks?.bottom ?? 'head' : null;
  const g = N.groove, fRated = res.kin.fRated, underPit = scheme === 'under';
  const specs: Row[] = [
    ['ARGANO', 'tipo', txt(machineText(Pl, x.marks?.catalog ?? null))],
    ['RAPPORTO DI RIDUZIONE', '', `1 : ${num(N.i)}`],
    ['PULEGGIA DI FRIZIONE Ø', 'mm', fmt(N.D, 0)],
    ['PULEGGIA DI RINVIO/TAGLIA Ø', 'mm', I.layout === 'top' && I.r === 1 ? '—' : fmt(I.Dp, 0)],
    ['ANGOLO DI AVVOLGIMENTO', '°', fmt(res.alphaDeg, 0)],
    // the angles the sheave is made to, as the calculation checks them (to the half degree)
    ['ANGOLO GOLE γ - β', '°', `${num(g.gamma)} - ${num(g.beta)}`],
    ['POTENZA MOTORE', 'kW', num(N.Pn)],
    ['POLI N° - GIRI/MINUTO', '', `${N.poles}/${fmt(N.nm, 0)}`],
    ['CORRENTE NOMINALE / AVVIAMENTO', 'A', Pl.currentIn || Pl.currentStart ? `${num(Pl.currentIn)} / ${num(Pl.currentStart)}` : '—'],
    ['REGOLAZIONE FREQUENZA VVVF', 'Hz', fmt(fRated, 1)],
    ['REGOLAZIONE GIRI/MIN VVVF', '1/min', fmt((N.nm * fRated) / N.fn, 0)],
    ['ARCATA', 'tipo', kept('sling') ? 'ESISTENTE' : L.frame.kind === 'central' ? 'CENTRALE' : 'A ZAINO'],
    ['GUIDE DI CABINA', 'tipo', rails(L.inputs.carRail)],
    ['LUNGHEZZA GUIDE DI CABINA', 'm', oldRails ? 'ESISTENTI' : fmt(railLen, 1)],
    ['STAFFE GUIDE DI CABINA', 'N°', brackets(Pl.carBracketPitch)],
    ['INTERASSE MASSIMO STAFFE CABINA', 'mm', fmt(spanCar, 0)],
    ['GUIDE CONTRAPPESO', 'tipo', rails(L.inputs.cwRail)],
    ['LUNGHEZZA GUIDE CONTRAPPESO', 'm', oldRails ? 'ESISTENTI' : fmt(railLen, 1)],
    ['STAFFE GUIDE CONTRAPPESO', 'N°', brackets(Pl.cwBracketPitch)],
    ['INTERASSE MASSIMO STAFFE CONTRAPPESO', 'mm', fmt(spanCw, 0)],
    ['FUNI DI SOSPENSIONE', 'N°-Ø', `${N.n} - ${num(N.d)}${oldRopes ? ' ESISTENTI' : ''}`],
    ['LUNGHEZZA DI TAGLIO FUNI (CIASCUNA)', 'm', oldRopes ? 'ESISTENTI' : fmt(ropeLen, 0)],
    ['LIMITATORE DI VELOCITÀ', 'tipo', oldGov ? 'ESISTENTE' : `${gov.brand} ${gov.model}`],
    ['FUNE DEL LIMITATORE', 'm-Ø', oldGov ? 'ESISTENTE' : `${fmt(governorRopeLength(V, S.top, room, scheme), 0)} - ${fmt(2 * gov.rope, 0)}`],
    ['AMMORTIZZATORI CABINA', 'N°-tipo', `${V.carBuffers} - ${BUFFER_TEXT[bufferType(V, 'car')][0]}${kept('buffers') ? ' ESISTENTI' : ''}`],
    ['AMMORTIZZATORE CONTRAPPESO', 'N°-tipo', `1 - ${BUFFER_TEXT[bufferType(V, 'cw')][1]}${kept('buffers') ? ' ESISTENTE' : ''}`],
    // a machine under the pit: the counterweight's safety gear over the space under the shaft (cw-gear.ts)
    ...(underPit ? [['PARACADUTE CONTRAPPESO', 'tipo', cwGearRow(Pl)] as Row] : []),
  ];

  // loads on the machine and on the building, as the calculation and the report take them (sheet-loads.ts): the whole
  // machine (a catalogue's parts estimated), its bedframe and support, the HEB beams, the cables and the dynamic
  // coefficient of the registry; a machine below pulls its anchors up and the head pulleys carry both falls of each side;
  // a counterweight's safety gear over a space under the shaft loads its rails (P7, cw-gear.ts).
  // The machine drawn is the proposal's (its shape); its whole mass that of the catalogue's model the values are, also
  // one entered by hand (known.ts), as the design's derivation and the relazione count it
  const made = x.marks?.catalog ?? null, M = machineOf(a, Pl, L, made), below = I.layout === 'bottom';
  const SL = sheetLoads(a, L, Pl, M, massModelOf(I, N, x.values, made), N.n * N.qf * ropeLen, R, cwGearOf(underPit, Pl)), { ropesKg, cablesKg, dyn, ld } = SL, machine = SL.carried;
  const kg = (v: number | undefined): string => (v == null ? '—' : fmt(v, 0));
  const loadRows: DataSheet['loads'] = [
    ['CABINA', kg(Pl.massShell), 'kg'],
    ['PAVIMENTO DEL CLIENTE (MAX)', kg(Pl.massFloor), 'kg'],
    ['OPERATORE E ANTINE', kg(Pl.massDoors), 'kg'],
    ['ARCATA', kg(Pl.massFrame), 'kg'],
    ['PESO TOTALE CABINA', `${fmt(I.P, 0)}${pEstimate ? ' (STIMA)' : ''}`, 'kg'],
    ['FUNI', fmt(ropesKg, 0), 'kg'],
    ['CAVI FLESSIBILI', fmt(cablesKg, 0), 'kg'],
    ['CONTRAPPESO', fmt(res.Mcw, 0), 'kg'],
    [below ? 'CARICO STATICO SULLE PULEGGE IN TESTATA' : 'CARICO STATICO SUL BASAMENTO DELL’ARGANO', fmt(ld.static, 0), 'kg'],
    [`COEFFICIENTE DINAMICO × ${fmt(dyn, 1)}`, fmt(ld.dynamic, 0), 'kg'],
    ['TOTALE CARICHI × 0,981', fmt(ld.P[0] ?? 0, 0), 'daN'],
    ...(below ? [
      [`ARGANO IN BASSO (NON SULLA SOLETTA)${SL.machine.estimate ? ' (STIMA)' : ''}`, fmt(SL.machine.kg, 0), 'kg'] as const,
      ['SOLLEVAMENTO NETTO ANCORAGGI ARGANO, PROVA 1,25·Q', fmt(Math.max(0, res.shaft.uplift ?? 0), 0), 'kg'] as const,
      [`TIRO ANCORAGGI ARGANO, PORTATA × ${fmt(dyn, 1)}`, fmt(Math.max(0, SL.anchor?.dyn ?? 0), 0), 'kg'] as const,
    ] : [[`ARGANO${SL.machine.estimate ? ' (STIMA)' : ''}`, fmt(SL.machine.kg, 0), 'kg'] as const, ...supportRows(SL.support, M, fmt), ...hebRows(SL.heb, fmt)]),
  ];
  // the machine room over the shaft: the hook's rated load and the reactions R1…Rn on the support's bearings (round 36)
  const Gr = !below ? roomGeo(L, M) : null, car0 = carSideStatic({ P: I.P, Q: I.Q, roping: I.r, ropes: ropesKg, cables: cablesKg });
  const roomRows = Gr ? [hookRow(Gr, M, fmt), ...reactionRows(Gr, M, { machine, static: ld.static, dyn, car: car0, stand: SL.support.stand },
    hebFor(Gr, M, shaftUnder(L), governorRopes(L, Gr.room)), fmt)] : [];
  const each = [false, false, false, false, true, V.carBuffers > 1, true, false, false];
  const P = ld.P.map((p, i) => (p === null ? (i === 3 ? GOVERNOR_LOAD_UNSET : '—') : `${each[i] ? 'cad. ' : ''}${fmt(p, 0)}`));
  // the car rails between their brackets (the pitch declared or the rule's), at the loads of this sheet (sheet-loads.ts)
  const { gear, F, rc } = R;
  const labels: Readonly<Record<string, string>> = appIt.shaft, OUTCOME = { ok: 'OK', warn: 'ATTENZIONE', fail: 'NON PASSA', info: '—' } as const;
  const withUnit = (x: number | null, dp: number, u: string): string => (x == null ? '—' : `${fmt(x, dp)}${u ? ` ${u}` : ''}`);
  // the clause stays in the label, the standard is in the heading of the table; the door of the room in its sizes
  // the shaft's checks, then the beams under the machine at the load of this sheet
  const car = carSideStatic({ P: I.P, Q: I.Q, roping: I.r, ropes: ropesKg, cables: cablesKg });
  // a machine below: its own room in place of the one over the shaft (the pulley room's checks apart; below-checks.ts)
  const bg = scheme ? belowGeoOf(a, L, M, scheme) : null, mRoom = bg ? belowRoomOf(L, bg, M).R : room;
  // the pulley room the sheets draw and the checks measure (the design's, else the software's standard one)
  const pRoom = scheme === 'room' ? pulleyRoomOf(L.inputs) : null;
  // the car's top and the refuge on its roof under what the rope rig hangs in the shaft (head.ts), and with them the
  // clearance on the counterweight's sign (cw-gap.ts) in place of the shaft's own
  const head = headTopChecks(withRig(L, I.r, I.Dp, N.n, N.d, bg), I.r, I.Dp, scheme);
  const all = [...mergeChecks(L.checks, [...supportChecks(L, M, { machine: below ? 0 : machine, static: ld.static, dyn, car }, !below),
    ...(bg ? belowChecks(L, bg, M, I.Dp) : []), ...head, ...cwGapOver(L, head)]), ...railChecks(rc, gear, I.v),
    ...cwGearChecks(underPit, Pl, I.v, C.norma !== 'en81')];
  // a modification: the existing room's height under 2,0 m (UNI 10411-1:2024, 9.2)
  if (I.context === 'repl' && room && !below) all.push(existingRoomCheck(room));
  // the existing sling under a new car or rated load (arcata.ts)
  const sling = slingCheck(C, carichiOf(x.values));
  if (sling) all.push(sling);
  const checks: DataSheet['checks'] = all.map((c) => {
    const label = (labels[`c_${c.id}`] ?? c.id).replace(' (UNI EN 81-20, ', ' (');
    // a check of a part that stays as it is is out of the acceptance test (note on the sheet)
    const outcome = ambitoOf(C, c.id) === 'existing' ? 'ESISTENTE' : OUTCOME[c.status];
    if (c.id === 'm_door' && mRoom) return [label.replace(', margine', ''), `${mRoom.doorW} × ${mRoom.doorH} mm`, `≥ ${KV_VERT.doorMinW} × ${KV_VERT.doorMinH} mm`, outcome];
    if (c.id === 'm_pdoor' && pRoom) return [label.replace(', margine', ''), `${pRoom.doorW} × ${pRoom.doorH} mm`, `≥ ${KV_VERT.doorMinW} × ${KV_VERT.pulleyDoorH} mm`, outcome];
    return [label, c.value == null ? '—' : `${shownValue(c, fmt)}${c.unit ? ` ${c.unit}` : ''}`, c.limit == null ? '—' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${withUnit(c.limit, c.dec, c.unit)}`, outcome];
  });
  // the rooms as the scheme of a machine below has them, existing in a modification tested to UNI 10411-1/-11 (9.2); the
  // shaft's note with the pit, the sills, the counterweight's sign and the brackets' anchors (notes-vano.ts)
  const gap = all.find((c) => c.id === 'h_cwgap')?.value ?? null;
  const sp = spaceLegend(L, fmt), notes = clientNotes(L, below, { scheme, norma: C.norma,
    detail: shaftDetailText(L, { cwGap: gap === null ? null : num(gap), fx: fmt(F.fx, 0), fy: fmt(F.fy, 0) }) });
  if (pEstimate) notes.push(estimateNote(fmt(I.P, 0), `NOTA ${notes.length + 1}`));
  if (!Pl.safetyGear) notes.push(safetyGearNote(`NOTA ${notes.length + 1}`));
  // the note of the rails' check wherever the check enters the acceptance test (new rails, or a change of load, car or sling)
  if (ambitoOf(C, 'gr_stress') === 'applies') notes.push(railNote(rc, railLabel(L.inputs.carRail), gear, Pl.liftUse, `NOTA ${notes.length + 1}`, fmt));
  // the governor's load not given; the HEB beams' bearings (round 36)
  if (Gr && SL.heb) notes.push(hebNote(`NOTA ${notes.length + 1}`));
  const test = collaudoNote(C, `NOTA ${notes.length + 1}`, carichiOf(x.values));
  if (test) notes.push(test);

  return {
    warnings, cwGap: gap, rails: { fx: fmt(F.fx, 0), fy: fmt(F.fy, 0), kept: oldRails },
    sheet: {
      base, specs, loads: [...loadRows, ...roomRows], notes, legend: [sp.free, sp.pit, sp.top],
      forces: { fx: fmt(F.fx, 0), fy: fmt(F.fy, 0) }, checks,
      electric: [['TENSIONE F.M.', 'V', num(Pl.voltage)], ['LUCE', 'V', num(Pl.lightVoltage)], ['FREQUENZA', 'Hz', num(Pl.frequency)], ['INTERMITTENZA', '%', num(Pl.duty)]],
      // the title block's words (an existing lift's plant number is to be given), the records the set goes with
      P, loadNames: loadNames(below), ...titleOf(x, pages, C.norma !== 'en81'), refs: refsText(x.records),
    },
  };
}
