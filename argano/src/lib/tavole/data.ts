// Values of sheet 1, written: characteristics and specifications of the installation from the calculation, the shaft
// design and the data of the installation; the analysis of the loads on the machine; P1…P9; the forces on the rails;
// the electrical supply; the title block. What nobody entered prints as a dash. The calculation and the design must
// describe the same lift: where they disagree the set carries a warning.
import appIt from '../../../messages/it.json';
import type { Analysis } from '../present/analysis';
import { makeFmt } from '../present/tr';
import { isUpperLimit } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import { RAILS, railLabel, type RailType } from '@/shaft/rails';
import { section } from '@/shaft/section';
import type { DataSheet, Row } from './datasheet';
import { railForces } from './forces';
import { dateIt, placeLines, type TavoleInput } from './input';
import { loads } from './loads';
import { clientNotes, spaceLegend } from './notes';

const fmt = makeFmt('it-IT');
const dec = (x: number): number => (Number.isInteger(x) ? 0 : Math.abs(x * 10 - Math.round(x * 10)) < 1e-9 ? 1 : 2);
const num = (x: number | null | undefined): string => (x == null ? '—' : fmt(x, dec(x)));
const txt = (s: string | undefined, fallback = '—'): string => (s && s.trim() ? s.trim() : fallback);

export interface DataSheetResult {
  sheet: DataSheet;
  warnings: string[];
}

export function dataSheet(x: TavoleInput, a: Analysis, pages: number): DataSheetResult {
  const { ctx, res } = a, { I, N } = ctx, L = x.layout, Pl = x.plant, V = L.inputs.vertical, S = section(L);
  const warnings: string[] = [];
  const travel = S.top / 1000;
  if (Math.abs(travel - I.H) > 0.05) warnings.push(`corsa del calcolo ${fmt(I.H, 2)} m, del vano ${fmt(travel, 2)} m`);
  if (Math.abs(V.v - I.v) > 0.005) warnings.push(`velocità del calcolo ${fmt(I.v, 2)} m/s, del vano ${fmt(V.v, 2)} m/s`);
  if (L.Q !== I.Q) warnings.push(`portata del calcolo ${fmt(I.Q, 0)} kg, del vano ${fmt(L.Q, 0)} kg`);

  // stops and landing doors actually served
  const served = (f: (typeof V.floors)[number]): number => [...f.door].filter((s) => L.doors.some((d) => d.side === s)).length;
  const services = V.floors.reduce((n, f) => n + served(f), 0);
  const access = L.inputs.entrances === 'one' ? '1 ACCESSO' : L.inputs.entrances === 'opposite' ? '2 ACCESSI OPPOSTI' : '2 ACCESSI ADIACENTI A 90°';
  const doors = L.inputs.door === 'T2' ? 'AUTOMATICHE TELESCOPICHE 2 ANTE' : 'AUTOMATICHE CENTRALI 2 ANTE';
  const base: Row[] = [
    ['NORMATIVA DI RIFERIMENTO', '', I.context === 'repl' ? 'UNI 10411-1:2024' : 'UNI EN 81-20:2020'],
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
    ['PORTE DI PIANO', 'tipo', txt(Pl.landingDoors, doors)],
    ['PORTE DI CABINA', 'tipo', txt(Pl.carDoors, doors)],
  ];

  // rails from the pit floor to under the slab; brackets at the declared pitch; ropes and governor rope (estimates)
  const railLen = (V.pit + S.top + V.headroom - KV_VERT.railTopGap) / 1000;
  const rails = (kind: 'new' | 'existing' | undefined, t: RailType): string => `${kind === 'existing' ? 'ESISTENTI ' : ''}${railLabel(t)}`;
  const brackets = (kind: 'new' | 'existing' | undefined, text: string | undefined, pitch: number | undefined): string =>
    txt(text, kind === 'existing' ? 'ESISTENTI' : pitch ? `${2 * (Math.floor((railLen * 1000) / pitch) + 1)}` : '—');
  const ropeLen = I.r * (I.H + 2 * I.L0) + (I.layout === 'topDefl' ? I.h : I.layout === 'bottom' ? 2 * I.Hv : 0);
  const room = L.inputs.room, govLen = (2 * (V.pit + S.top + V.headroom + (room ? room.slab + KV_VERT.governorAbove : 0))) / 1000;
  const g = N.groove, fRated = res.kin.fRated;
  const specs: Row[] = [
    ['ARGANO', 'tipo', txt(Pl.machine)],
    ['RAPPORTO DI RIDUZIONE', '', `1 : ${num(N.i)}`],
    ['PULEGGIA DI TRAZIONE Ø', 'mm', fmt(N.D, 0)],
    ['PULEGGIA DI RINVIO/TAGLIA Ø', 'mm', I.layout === 'top' && I.r === 1 ? '—' : fmt(I.Dp, 0)],
    ['ANGOLO DI AVVOLGIMENTO', '°', fmt(res.alphaDeg, 0)],
    ['ANGOLO GOLE γ - β', '°', `${fmt(g.gamma, 0)} - ${fmt(g.beta, 0)}`],
    ['POTENZA MOTORE', 'kW', num(N.Pn)],
    ['POLI N° - GIRI/MINUTO', '', `${N.poles}/${fmt(N.nm, 0)}`],
    ['CORRENTE NOMINALE / AVVIAMENTO', 'A', Pl.currentIn || Pl.currentStart ? `${num(Pl.currentIn)} / ${num(Pl.currentStart)}` : '—'],
    ['REGOLAZIONE FREQUENZA VVVF', 'Hz', fmt(fRated, 0)],
    ['REGOLAZIONE GIRI/MIN VVVF', '1/min', fmt((N.nm * fRated) / N.fn, 0)],
    ['ARCATA', 'tipo', txt(Pl.carFrame, L.frame.kind === 'central' ? 'CENTRALE' : 'A ZAINO')],
    ['GUIDE DI CABINA', 'tipo', rails(Pl.carRails, L.inputs.carRail)],
    ['LUNGHEZZA GUIDE DI CABINA', 'm', Pl.carRails === 'existing' ? 'ESISTENTI' : fmt(railLen, 1)],
    ['STAFFE GUIDE DI CABINA', 'N°', brackets(Pl.carRails, Pl.carBrackets, Pl.carBracketPitch)],
    ['PASSO STAFFE CABINA', 'mm', num(Pl.carBracketPitch)],
    ['GUIDE CONTRAPPESO', 'tipo', rails(Pl.cwRails, L.inputs.cwRail)],
    ['LUNGHEZZA GUIDE CONTRAPPESO', 'm', Pl.cwRails === 'existing' ? 'ESISTENTI' : fmt(railLen, 1)],
    ['STAFFE GUIDE CONTRAPPESO', 'N°', brackets(Pl.cwRails, Pl.cwBrackets, Pl.cwBracketPitch)],
    ['PASSO STAFFE CONTRAPPESO', 'mm', num(Pl.cwBracketPitch)],
    ['FUNI DI TRAZIONE', 'N°-Ø', `${N.n} - ${num(N.d)}`],
    ['LUNGHEZZA FUNI (CIASCUNA)', 'm', fmt(ropeLen, 0)],
    ['LIMITATORE DI VELOCITÀ', 'tipo', txt(Pl.governor)],
    ['FUNE DEL LIMITATORE', 'm-Ø', `${fmt(Math.ceil(govLen), 0)} - ${txt(Pl.governorRope)}`],
    ['AMMORTIZZATORI CABINA', 'N°-tipo', `${V.carBuffers} - ${txt(Pl.carBuffers, 'MOLLE')}`],
    ['AMMORTIZZATORE CONTRAPPESO', 'N°-tipo', `1 - ${txt(Pl.cwBuffers, 'MOLLA')}`],
  ];

  // loads on the machine and on the building
  const ropesKg = N.n * N.qf * ropeLen, cablesKg = Pl.massCables ?? KV_VERT.cableKgM * (travel / 2 + 3);
  const machine = Pl.massMachine ?? N.mass, dyn = Pl.dynFactor ?? KV_VERT.dynFactor;
  const ld = loads({
    P: I.P, Q: I.Q, Mcw: res.Mcw, ropes: ropesKg, cables: cablesKg, machine, roping: I.r,
    carRailQ: RAILS[L.inputs.carRail].q, carRailLen: railLen, cwRailQ: RAILS[L.inputs.cwRail].q, cwRailLen: railLen,
    safetyGear: Pl.safetyGear ?? 'progressive', dyn, carBuffers: V.carBuffers, cwBuffers: 1, governor: Pl.governorLoad ?? null,
  });
  const kg = (v: number | undefined): string => (v == null ? '—' : fmt(v, 0));
  const loadRows: DataSheet['loads'] = [
    ['CABINA', kg(Pl.massShell), 'kg'],
    ['PAVIMENTO DEL CLIENTE (MAX)', kg(Pl.massFloor), 'kg'],
    ['OPERATORE E ANTINE', kg(Pl.massDoors), 'kg'],
    ['ARCATA', kg(Pl.massFrame), 'kg'],
    ['PESO TOTALE CABINA', fmt(I.P, 0), 'kg'],
    ['FUNI', fmt(ropesKg, 0), 'kg'],
    ['CAVI FLESSIBILI', fmt(cablesKg, 0), 'kg'],
    ['CONTRAPPESO', fmt(res.Mcw, 0), 'kg'],
    ['CARICO STATICO SU ASSE ARGANO', fmt(ld.static, 0), 'kg'],
    [`COEFFICIENTE DINAMICO × ${fmt(dyn, 1)}`, fmt(ld.dynamic, 0), 'kg'],
    ['TOTALE CARICHI × 0,981', fmt(ld.P[0] ?? 0, 0), 'daN'],
    ['ARGANO E TELAIO', fmt(machine, 0), 'kg'],
  ];
  const each = [false, false, false, false, true, V.carBuffers > 1, true, false, false];
  const P = ld.P.map((p, i) => (p === null ? '—' : `${each[i] ? 'cad. ' : ''}${fmt(p, 0)}`));
  const F = railForces(L, I.P, I.Q, Pl.safetyGear ?? 'progressive');
  const labels: Readonly<Record<string, string>> = appIt.shaft, OUTCOME = { ok: 'OK', warn: 'ATTENZIONE', fail: 'NON CONFORME', info: '—' } as const;
  const withUnit = (x: number | null, dp: number, u: string): string => (x == null ? '—' : `${fmt(x, dp)}${u ? ` ${u}` : ''}`);
  // the clause stays in the label, the standard is in the heading of the table; the door of the room in its sizes
  const checks: DataSheet['checks'] = L.checks.map((c) => {
    const label = (labels[`c_${c.id}`] ?? c.id).replace(' (UNI EN 81-20, ', ' (');
    if (c.id === 'm_door' && room) return [label.replace(', margine', ''), `${room.doorW} × ${room.doorH} mm`, `≥ ${KV_VERT.doorMinW} × ${KV_VERT.doorMinH} mm`, OUTCOME[c.status]];
    return [label, withUnit(c.value, c.dec, c.unit), c.limit == null ? '—' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${withUnit(c.limit, c.dec, c.unit)}`, OUTCOME[c.status]];
  });
  const sp = spaceLegend(L, fmt);

  return {
    warnings,
    sheet: {
      base, specs, loads: loadRows, notes: clientNotes(L), legend: [sp.free, sp.pit, sp.top],
      forces: { fx: fmt(F.fx, 0), fy: fmt(F.fy, 0) }, checks,
      electric: [['TENSIONE F.M.', 'V', num(Pl.voltage)], ['LUCE', 'V', num(Pl.lightVoltage)], ['FREQUENZA', 'Hz', num(Pl.frequency)], ['INTERMITTENZA', '%', num(Pl.duty)]],
      P, client: x.project.client || '—', location: placeLines(x.project), author: x.set.author, date: dateIt(x.set.issuedAt),
      revisions: x.set.revisions.map((r) => ({ mark: r.mark, text: r.text, date: dateIt(r.date) })),
      number: x.set.number, pages, plant: x.project.plantNumber || '—', company: x.company.name, logo: x.company.logo !== null,
    },
  };
}
