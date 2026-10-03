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
import { headTopChecks } from '../lift/head';
import { cablesMass, headStatic, ropeLength, supportChecks } from '../lift/support';
import { isUpperLimit, shownValue } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import { bracketCount } from '@/shaft/brackets';
import { bufferType } from '@/shaft/buffers';
import { govSize } from '@/shaft/governor';
import { hasImbotti, imbottiOf } from '@/shaft/imbotti';
import type { BufferType } from '@/shaft/vertical';
import { RAILS, railLabel, type RailType } from '@/shaft/rails';
import { section } from '@/shaft/section';
import type { DataSheet, Row } from './datasheet';
import { railForces } from './forces';
import { dateIt, placeLines, type TavoleInput } from './input';
import { loads } from './loads';
import { machineOf, machineText } from './views';
import { clientNotes, estimateNote, safetyGearNote, spaceLegend } from './notes';
import { NORMA_SIGLA, ambitoOf, collaudoOf } from '../lift/collaudo';
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
  const kept = (p: (typeof C.parti)[number]): boolean => C.norma !== 'en81' && !C.parti.includes(p);

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
  ];

  // rails from the pit floor to under the slab, new or existing as the acceptance test says; brackets one every pitch
  // (the declared one or the rule's) plus the first and the last of each rail (registry guide.staffe); ropes and governor
  // rope (estimates); the governor the design takes (the one chosen, else by the speed)
  const railLen = (V.pit + S.top + V.headroom - KV_VERT.railTopGap) / 1000, oldRails = kept('rails');
  const rails = (t: RailType): string => `${oldRails ? 'ESISTENTI ' : ''}${railLabel(t)}`;
  const brackets = (pitch: number | undefined): string => (oldRails ? 'ESISTENTI' : `${2 * bracketCount(railLen * 1000, pitch ?? KV_VERT.bracketPitch)}`);
  const gov = govSize(V.v, L.inputs.governor), oldGov = kept('governor');
  const ropeLen = ropeLength(I);
  const room = L.inputs.room, govLen = (2 * (V.pit + S.top + V.headroom + (room ? room.slab + KV_VERT.governorAbove : 0))) / 1000;
  const g = N.groove, fRated = res.kin.fRated;
  const specs: Row[] = [
    ['ARGANO', 'tipo', txt(machineText(Pl, x.marks?.catalog ?? null))],
    ['RAPPORTO DI RIDUZIONE', '', `1 : ${num(N.i)}`],
    ['PULEGGIA DI TRAZIONE Ø', 'mm', fmt(N.D, 0)],
    ['PULEGGIA DI RINVIO/TAGLIA Ø', 'mm', I.layout === 'top' && I.r === 1 ? '—' : fmt(I.Dp, 0)],
    ['ANGOLO DI AVVOLGIMENTO', '°', fmt(res.alphaDeg, 0)],
    ['ANGOLO GOLE γ - β', '°', `${fmt(g.gamma, 0)} - ${fmt(g.beta, 0)}`],
    ['POTENZA MOTORE', 'kW', num(N.Pn)],
    ['POLI N° - GIRI/MINUTO', '', `${N.poles}/${fmt(N.nm, 0)}`],
    ['CORRENTE NOMINALE / AVVIAMENTO', 'A', Pl.currentIn || Pl.currentStart ? `${num(Pl.currentIn)} / ${num(Pl.currentStart)}` : '—'],
    ['REGOLAZIONE FREQUENZA VVVF', 'Hz', fmt(fRated, 1)],
    ['REGOLAZIONE GIRI/MIN VVVF', '1/min', fmt((N.nm * fRated) / N.fn, 0)],
    ['ARCATA', 'tipo', kept('sling') ? 'ESISTENTE' : L.frame.kind === 'central' ? 'CENTRALE' : 'A ZAINO'],
    ['GUIDE DI CABINA', 'tipo', rails(L.inputs.carRail)],
    ['LUNGHEZZA GUIDE DI CABINA', 'm', oldRails ? 'ESISTENTI' : fmt(railLen, 1)],
    ['STAFFE GUIDE DI CABINA', 'N°', brackets(Pl.carBracketPitch)],
    ['PASSO STAFFE CABINA', 'mm', num(Pl.carBracketPitch ?? KV_VERT.bracketPitch)],
    ['GUIDE CONTRAPPESO', 'tipo', rails(L.inputs.cwRail)],
    ['LUNGHEZZA GUIDE CONTRAPPESO', 'm', oldRails ? 'ESISTENTI' : fmt(railLen, 1)],
    ['STAFFE GUIDE CONTRAPPESO', 'N°', brackets(Pl.cwBracketPitch)],
    ['PASSO STAFFE CONTRAPPESO', 'mm', num(Pl.cwBracketPitch ?? KV_VERT.bracketPitch)],
    ['FUNI DI TRAZIONE', 'N°-Ø', `${N.n} - ${num(N.d)}`],
    ['LUNGHEZZA FUNI (CIASCUNA)', 'm', fmt(ropeLen, 0)],
    ['LIMITATORE DI VELOCITÀ', 'tipo', oldGov ? 'ESISTENTE' : `${gov.brand} ${gov.model}`],
    ['FUNE DEL LIMITATORE', 'm-Ø', oldGov ? 'ESISTENTE' : `${fmt(Math.ceil(govLen), 0)} - ${fmt(2 * gov.rope, 0)}`],
    ['AMMORTIZZATORI CABINA', 'N°-tipo', `${V.carBuffers} - ${BUFFER_TEXT[bufferType(V, 'car')][0]}${kept('buffers') ? ' ESISTENTI' : ''}`],
    ['AMMORTIZZATORE CONTRAPPESO', 'N°-tipo', `1 - ${BUFFER_TEXT[bufferType(V, 'cw')][1]}${kept('buffers') ? ' ESISTENTE' : ''}`],
  ];

  // loads on the machine and on the building, as the calculation and the report take them: the machine's mass of the
  // calculation with its bedframe (the maker's bedplate with the diverting pulley counted), the cables and the dynamic
  // coefficient of the registry; a machine below pulls its anchors up and the head pulleys carry both falls of each side
  const M = machineOf(a, Pl, L, x.marks?.catalog ?? null), below = I.layout === 'bottom';
  const ropesKg = N.n * N.qf * ropeLen, cablesKg = cablesMass(travel);
  const bedplate = M.rinvio?.on === 'frame' ? M.rinvio.maker?.mass ?? 0 : 0;
  const machine = N.mass + bedplate, dyn = KV_VERT.dynFactor;
  const ld = loads({
    P: I.P, Q: I.Q, Mcw: res.Mcw, ropes: ropesKg, cables: cablesKg, machine, roping: I.r,
    carRailQ: RAILS[L.inputs.carRail].q, carRailLen: railLen, cwRailQ: RAILS[L.inputs.cwRail].q, cwRailLen: railLen,
    safetyGear: Pl.safetyGear ?? 'progressive', dyn, carBuffers: V.carBuffers, cwBuffers: 1, governor: Pl.governorLoad ?? null,
    below: below ? headStatic(a.ctx, res.Mcw) : null,
  });
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
    [below ? 'CARICO STATICO SULLE PULEGGE IN TESTATA' : 'CARICO STATICO SUL BASAMENTO DELL\'ARGANO', fmt(ld.static, 0), 'kg'],
    [`COEFFICIENTE DINAMICO × ${fmt(dyn, 1)}`, fmt(ld.dynamic, 0), 'kg'],
    ['TOTALE CARICHI × 0,981', fmt(ld.P[0] ?? 0, 0), 'daN'],
    ...(below ? [
      ['ARGANO IN BASSO (NON SUL SOLAIO)', fmt(machine, 0), 'kg'] as const,
      ['SOLLEVAMENTO NETTO ANCORAGGI ARGANO, PROVA 1,25·Q', fmt(Math.max(0, res.shaft.uplift ?? 0), 0), 'kg'] as const,
    ] : [[!bedplate ? 'ARGANO E TELAIO' : 'ARGANO E BASAMENTO CON RINVIO', fmt(machine, 0), 'kg'] as const]),
  ];
  const each = [false, false, false, false, true, V.carBuffers > 1, true, false, false];
  const P = ld.P.map((p, i) => (p === null ? '—' : `${each[i] ? 'cad. ' : ''}${fmt(p, 0)}`));
  const F = railForces(L, I.P, I.Q, Pl.safetyGear ?? 'progressive');
  const labels: Readonly<Record<string, string>> = appIt.shaft, OUTCOME = { ok: 'OK', warn: 'ATTENZIONE', fail: 'NON PASSA', info: '—' } as const;
  const withUnit = (x: number | null, dp: number, u: string): string => (x == null ? '—' : `${fmt(x, dp)}${u ? ` ${u}` : ''}`);
  // the clause stays in the label, the standard is in the heading of the table; the door of the room in its sizes
  // the shaft's checks, then the beams under the machine at the load of this sheet
  const all = [...L.checks, ...supportChecks(L, M, { machine: below ? 0 : machine, static: ld.static, dyn }, !below),
    ...headTopChecks(L, I.r, I.Dp, below ? x.marks?.bottom ?? 'head' : null)];
  const checks: DataSheet['checks'] = all.map((c) => {
    const label = (labels[`c_${c.id}`] ?? c.id).replace(' (UNI EN 81-20, ', ' (');
    // a check of a part that stays as it is is out of the acceptance test (note on the sheet)
    const outcome = ambitoOf(C, c.id) === 'existing' ? 'ESISTENTE' : OUTCOME[c.status];
    if (c.id === 'm_door' && room) return [label.replace(', margine', ''), `${room.doorW} × ${room.doorH} mm`, `≥ ${KV_VERT.doorMinW} × ${KV_VERT.doorMinH} mm`, outcome];
    return [label, c.value == null ? '—' : `${shownValue(c, fmt)}${c.unit ? ` ${c.unit}` : ''}`, c.limit == null ? '—' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${withUnit(c.limit, c.dec, c.unit)}`, outcome];
  });
  const sp = spaceLegend(L, fmt), notes = clientNotes(L, below);
  if (pEstimate) notes.push(estimateNote(fmt(I.P, 0), `NOTA ${notes.length + 1}`));
  if (!Pl.safetyGear) notes.push(safetyGearNote(`NOTA ${notes.length + 1}`));
  const test = collaudoNote(C, `NOTA ${notes.length + 1}`);
  if (test) notes.push(test);

  return {
    warnings,
    sheet: {
      base, specs, loads: loadRows, notes, legend: [sp.free, sp.pit, sp.top],
      forces: { fx: fmt(F.fx, 0), fy: fmt(F.fy, 0) }, checks,
      electric: [['TENSIONE F.M.', 'V', num(Pl.voltage)], ['LUCE', 'V', num(Pl.lightVoltage)], ['FREQUENZA', 'Hz', num(Pl.frequency)], ['INTERMITTENZA', '%', num(Pl.duty)]],
      P, client: x.project.client || '—', location: placeLines(x.project), author: x.set.author, date: dateIt(x.set.issuedAt),
      revisions: x.set.revisions.map((r) => ({ mark: r.mark, text: r.text, date: dateIt(r.date) })),
      number: x.set.number, pages, plant: x.project.plantNumber || '—', company: x.company.name, logo: x.company.logo !== null, clientLogo: x.clientLogo != null,
    },
  };
}
