// Round 37 (J): the reactions on the building add up to the total sheet 1 and the relazione write (W2-L1a-01) — the
// beams from wall to wall and the HEB beams bear their whole own weight, the part in the walls too, and the diverting
// pulley's own stand on the floor bears its own weight on its four legs, numbered after the support's bearings; the HEB
// beams' largest reaction is the largest R; the check of the existing openings counts the support's bearings alone; the
// replacement's sheet 1 (survey-data.ts) carries the stand's legs too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { roomGeo, type MachineSupport } from '@/shaft';
import { hebDrawn } from '@/shaft/heb';
import { PROFILES } from '@/shaft/profiles';
import { bearingPoints, reactionPoints, supportReactions } from '@/shaft/room-reactions';
import { governorRopes, shaftUnder } from '@/shaft/room-site';
import { onHeb } from '@/shaft/support';
import { beamSpans } from '@/shaft/support-view';
import { deriveLift, newLift, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { valueMarks } from '../lift/marks';
import { besideMass, carSideStatic, supportMass } from '../lift/support';
import { analyse } from '../present/analysis';
import { designRoomBlocks } from '../report/tecnica-site';
import { makeFmt } from '../present/tr';
import { deriveRoom } from '../room/derive';
import { startSurvey, type Survey } from '../room/survey';
import { storedInput } from '../tavole/compose';
import { dataSheet } from '../tavole/data';
import { sheetLoads, sheetRails } from '../tavole/sheet-loads';
import { surveyLoad, surveySheetData } from '../tavole/survey-data';
import type { SurveyTavoleInput } from '../tavole/survey-input';

type Room = NonNullable<LiftInputs['shaft']['room']>;
const withRoom = (L: LiftInputs, r: Partial<Room>): LiftInputs => {
  const R = L.shaft.room;
  assert.ok(R);
  return { ...L, shaft: { ...L.shaft, room: { ...R, ...r } } };
};
const direct = (L: LiftInputs): LiftInputs => ({ ...L, calc: { ...L.calc, layout: 'top' } });
const roping2 = (L: LiftInputs): LiftInputs => ({ ...L, calc: { ...L.calc, r: '2' } });
const SUPPORTS: readonly MachineSupport[] = [{ kind: 'shims' }, { kind: 'frame' }, { kind: 'plates' }, { kind: 'plinth' }, { kind: 'beams', profile: 'IPE 240' }];
/** The machine with the diverting pulley (the example's) and without (direct drive), on every support, with and
 *  without the HEB beams over the shaft. */
const SAMPLES: [string, LiftInputs][] = [
  ...[false, true].flatMap((pulley) => [false, true].flatMap((heb) => SUPPORTS.map((s): [string, LiftInputs] => {
    const L = withRoom(pulley ? newLift() : direct(newLift()), { support: s, ...(heb ? { heb: {} } : {}) });
    return [`${s.kind}${pulley ? ' + rinvio' : ''}${heb ? ' + HEB' : ''}`, L];
  }))),
  // the example's own bedplate with the pulley, on the floor and on the HEB beams; at 2:1 (the hitches P2 and P3 apart)
  ['telaio con rinvio', newLift()], ['telaio con rinvio + HEB', withRoom(newLift(), { heb: {} })],
  ['putrelle 2:1', withRoom(roping2(newLift()), { support: { kind: 'beams', profile: 'IPE 240' } })], ['telaio 2:1 + HEB', withRoom(roping2(direct(newLift())), { support: { kind: 'frame' }, heb: {} })],
];

const SET = { number: '26-037', createdAt: new Date('2026-10-09T08:00:00Z'), authorInitials: 'T', companyName: 'X', plant: {}, revisions: [],
  projectData: { name: 'x', address: null, city: null, province: null, plantNumber: null, client: null } };
const sheetOf = (inp: LiftInputs, d: LiftDerived) => {
  const x = storedInput(d.values, d.layout, SET, null, valueMarks(inp.auto, d, d.bottom, d.collaudo));
  assert.ok(x);
  return dataSheet(x, analyse(d.values), 9).sheet;
};
const daN = (kg: number): number => (kg * 9.81) / 10;

test('reazioni: la loro somma è il totale P9 del foglio 1 su ogni basamento, con le putrelle HEB e con il supporto del rinvio', () => {
  for (const [name, inp] of SAMPLES) {
    const d = deriveLift(inp), { I } = d.analysis.ctx, L = d.layout, M = d.machine, G = roomGeo(L, M);
    assert.ok(G, name);
    // the loads as sheet 1 counts them (sheet-loads.ts), the reactions at its load with the HEB beams it draws (data.ts)
    const R = sheetRails(L, I.P, I.Q, {}), ropes = 50, SL = sheetLoads(d.analysis, L, {}, M, null, ropes, R);
    const load = { machine: SL.carried, static: SL.ld.static, dyn: SL.dyn, car: carSideStatic({ P: I.P, Q: I.Q, roping: I.r, ropes, cables: SL.cablesKg }), stand: SL.support.stand };
    const heb = hebDrawn(G, M, shaftUnder(L), governorRopes(L, G.room)), rx = supportReactions(G, M, load, heb);
    // at 2:1 the rope hitches bear P2 and P3 on the slab beside the support
    const sum = [...rx.R, ...(rx.stand?.R ?? [])].reduce((a, b) => a + b, 0), hitches = (SL.ld.P[1] ?? 0) + (SL.ld.P[2] ?? 0);
    // (the support's own weight on the sheet is rounded to the kg: the beams' reactions take it unrounded)
    const tol = SL.support.kind === 'beams' ? daN(0.5) : 1e-6;
    assert.equal(hitches > 0, I.r === 2, name);
    assert.ok(Math.abs(sum + hitches - (SL.ld.P[8] ?? NaN)) <= tol, `${name}: ΣR ${sum} + ${hitches} ≠ P9 ${SL.ld.P[8]}`);
    // what bears where: the whole machine, its support and the HEB beams (P9 less P1), the stand on its legs
    assert.ok(Math.abs(sum - (SL.ld.P[0] ?? 0) - daN(SL.carried + besideMass(SL.support) + SL.hebKg)) <= tol, name);
    const stand = M.rinvio?.on === 'stand' && M.Dp > 0 && !onHeb(G.room, true);
    assert.equal(rx.stand !== null, stand, `${name}: supporto del rinvio`);
    if (rx.stand) {
      assert.equal(rx.stand.pts.length, 4);
      assert.ok(Math.abs(rx.stand.R.reduce((a, b) => a + b, 0) - daN(SL.support.stand)) < 1e-9, name);
      assert.ok(SL.support.stand > 30, `${name}: ${SL.support.stand} kg`);
      // the plan marks them after the support's; the existing openings' check takes the support's bearings alone
      assert.equal(reactionPoints(G, M, heb).length, rx.R.length + 4);
      assert.equal(bearingPoints(G, M, heb).length, rx.R.length);
    } else assert.equal(SL.support.stand, 0, name);
    // the beams from wall to wall carry their whole length (support-view.ts beamSpans), as their mass on the sheet
    if (SL.support.kind === 'beams') {
      const P = PROFILES[G.room.support?.profile ?? 'IPE 240'], len = beamSpans(G).reduce((a, [s0, s1]) => a + s1 - s0, 0);
      assert.ok(Math.abs(rx.R.reduce((a, b) => a + b, 0) - daN(load.machine + load.static * load.dyn + (P.mass * len) / 1000)) < 1e-6, name);
    }
    // the HEB beams: each as long as the sheet weighs it; the largest bearing reaction the sheet writes is the largest R
    if (heb && rx.on === 'walls' && SL.heb) {
      assert.equal(SL.heb.length, heb.length, name);
      assert.ok(Math.abs(SL.heb.result.reaction / 10 - Math.max(...rx.R)) < 1e-6, `${name}: ${SL.heb.result.reaction / 10} ≠ ${Math.max(...rx.R)}`);
    }
  }
});

test('foglio 1: R1…Rn e i piedi del rinvio, la somma è P9 entro gli arrotondamenti; la reazione massima delle HEB è la R più grande', () => {
  for (const [name, inp] of SAMPLES) {
    const d = deriveLift(inp), ds = sheetOf(inp, d);
    const rows = ds.loads.filter((r) => r[0].startsWith('REAZIONI')), R = rows.flatMap((r) => r[1].split(' / ').map(Number));
    const hitches = [ds.P[1], ds.P[2]].reduce((a, p) => a + (p === '—' ? 0 : Number(p)), 0);
    // each R, P2, P3 and P9 rounded to the daN
    assert.ok(Math.abs(R.reduce((a, b) => a + b, 0) + hitches - Number(ds.P[8])) <= R.length / 2 + 1.5, `${name}: ${R.join(' + ')} + ${hitches} ≠ ${ds.P[8]}`);
    const legs = rows.filter((r) => r[0].startsWith('REAZIONI PIEDI DEL RINVIO'));
    if (legs.length) {
      // numbered on from the support's bearings, on the slab
      const first = rows.findIndex((r) => r[0].startsWith('REAZIONI PIEDI DEL RINVIO')), before = rows.slice(0, first).flatMap((r) => r[1].split(' / ')).length;
      assert.match(legs[0]?.[0] ?? '', new RegExp(`^REAZIONI PIEDI DEL RINVIO R${before + 1} / R${before + 2} / R${before + 3} SULLA SOLETTA$`), name);
      assert.equal(legs.flatMap((r) => r[1].split(' / ')).length, 4, name);
    }
    const max = ds.loads.find((r) => r[0] === 'REAZIONE MASSIMA SU UN APPOGGIO NEL MURO DEL VANO');
    if (max && rows.some((r) => r[0].includes('NEI MURI'))) assert.equal(Number(max[1]), Math.max(...R.slice(0, 4)), name);
  }
});

test('relazione: le reazioni del locale con quelle dei piedi del supporto del rinvio, come il foglio 1', () => {
  const inp = withRoom(newLift(), { support: { kind: 'beams', profile: 'IPE 240' } }), d = deriveLift(inp), M = d.machine, G = roomGeo(d.layout, M);
  assert.ok(G && M.rinvio?.on === 'stand');
  const { I, N } = d.analysis.ctx, w = supportMass(G, M), fmt = makeFmt('it-IT');
  const load = { machine: 600, static: 2000, dyn: 2, stand: w.stand };
  const text = designRoomBlocks(d.layout, M, load, fmt).flatMap((b) => (b.t === 'p' ? [b.text] : [])).join(' ');
  assert.match(text, /nei muri, con il coefficiente dinamico: R1 \d+ daN, R2 \d+ daN, R3 \d+ daN, R4 \d+ daN, R5 \d+ daN, R6 \d+ daN; sotto i piedi del supporto del rinvio sulla soletta, il suo peso proprio: R7 \d+ daN, R8 \d+ daN, R9 \d+ daN, R10 \d+ daN\./);
  assert.ok(I.P > 0 && N.n > 0);
});

test('sostituzione: il foglio 1 del rilievo con i piedi del supporto del rinvio, ΣR + P2 + P3 = P9 entro gli arrotondamenti', () => {
  // the example with the diverting pulley on its own stand beside the machine's support (support.ts SupportMass.stand)
  const kinds: readonly MachineSupport[] = [{ kind: 'frame' }, { kind: 'plinth' }, { kind: 'beams', profile: 'IPE 240' }, { kind: 'plates' }, { kind: 'shims' }];
  const n = (x: string): number => Number(x.replace('−', '-'));
  for (const support of kinds) {
    const s0 = startSurvey(600), s: Survey = { ...s0, room: { ...s0.room, support } }, d = deriveRoom(PRESETS.A, s);
    const x: SurveyTavoleInput = { values: PRESETS.A, survey: s, collaudo: { norma: '10411-1', parti: ['machine'] }, plant: {},
      project: { name: 'R', address: null, city: null, province: null, plantNumber: null, client: null }, company: { name: 'S', logo: null },
      set: { number: '26-037', issuedAt: new Date('2026-10-09T08:00:00Z'), author: 'T', revisions: [] } };
    const sh = surveySheetData(x, d, 3), rows = sh.loads.filter((r) => r[0].startsWith('REAZIONI'));
    assert.equal(d.M.rinvio?.on, 'stand', support.kind);
    // the stand's four legs, with its own weight (surveyLoad's: the same the slab's total counts beside the support)
    const stand = surveyLoad(d, {}).support.stand, legs = rows.filter((r) => r[0].startsWith('REAZIONI PIEDI DEL RINVIO')).flatMap((r) => r[1].split(' / ').map(n));
    assert.ok(stand > 30, `${support.kind}: ${stand} kg`);
    assert.equal(legs.length, 4, support.kind);
    assert.ok(legs.every((r) => r > 0) && Math.abs(legs.reduce((a, b) => a + b, 0) - daN(stand)) <= 2, `${support.kind}: ${legs.join(' + ')} ≠ ${daN(stand)}`);
    // all the reactions with the 2:1 hitches are the total on the slab (each rounded to the daN)
    const R = rows.flatMap((r) => r[1].split(' / ').map(n)), [P2, P3, P9] = [sh.P[1]?.[1], sh.P[2]?.[1], sh.P[4]?.[1]].map((p) => (p === undefined || p === '—' ? 0 : n(p)));
    assert.ok(sh.P[4]?.[0].startsWith('P9') && P9 > 0, support.kind);
    assert.ok(Math.abs(R.reduce((a, b) => a + b, 0) + P2 + P3 - P9) <= R.length / 2 + 1.5, `${support.kind}: ${R.join(' + ')} + ${P2 + P3} ≠ ${P9}`);
  }
});
