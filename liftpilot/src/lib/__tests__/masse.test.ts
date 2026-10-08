// Round 36: the masses on the building — the machine as a whole whatever the catalogue's mass leaves out (registry
// impianto.massa.argano), the own weight of what carries it on the slab (impianto.massa.basamento), a bottom machine's
// pull on its anchors with the dynamic coefficient (albero.sollevamento, carichi.macchina).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, compute, readInputs } from '@/calc/index';
import { defaultInputs, layout, roomGeo, type MachineSupport, type ShaftInputs } from '@/shaft';
import { KV_VERT } from '@/shaft/norme-vert';
import { defaultLift, deriveLift, VOCI_IMPIANTO } from '@/lib/lift';
import { KM, VOCI_MASSE } from '@/lib/lift/norme-masse';
import { machineMass, motorKg, sheaveKg } from '@/lib/lift/machine-mass';
import { carriedBy, carriedMass, supportMass } from '@/lib/lift/support';
import { anchorPull } from '@/lib/lift/anchor';
import { catalogOf, massKindOf } from '@/lib/catalog/machines';
import { sheetLoads, sheetRails } from '../tavole/sheet-loads';
import { buildTavole } from '../tavole/build';
import type { TavoleInput } from '../tavole/input';
import { NO_MARKS } from '../lift/marks';

const daN = (kg: number): number => (kg * 9.81) / 10;
const near = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('massa dell’argano: quello che la massa di catalogo lascia fuori, stimato; l’argano completo nei carichi', () => {
  // the makers' definitions: SICOR the whole machine, Sassi without flywheel and sheave (LEO without the sheave), Montanari
  // the gearbox alone (PENTA and M105 with the motor)
  const kind = (brand: 'SICOR' | 'Sassi' | 'Montanari', model: string): string => massKindOf({ brand, model });
  assert.deepEqual([kind('SICOR', 'SH140'), kind('Sassi', 'MF84'), kind('Sassi', 'LEO'), kind('Montanari', 'M93'), kind('Montanari', 'PENTA')],
    ['totale', 'senza_volano_puleggia', 'senza_puleggia', 'riduttore', 'senza_volano_puleggia']);
  // the motor by its rated power, the next row of the table up; past its end in proportion
  assert.equal(motorKg(4), 42);
  assert.equal(motorKg(4.5), 62);
  assert.equal(motorKg(180), Math.ceil((660 * 180) / 90));
  // the sheave: Sassi's Ø 800 × 180 weighs 135 kg (8 grooves for Ø 13: pitch 20 + rims)
  const big = sheaveKg(800, 8, 13);
  assert.ok(Math.abs(big - 135) / 135 < 0.05, `puleggia Ø 800: ${big}`);
  assert.ok(sheaveKg(480, 4, 10) >= Math.ceil(KM.sheaveKgMm2 * 480 * KM.sheaveWidthMin), 'almeno la larghezza minima');
  // the proposal from each maker: what is added over the catalogue's mass
  const L = defaultLift();
  for (const [brand, model] of [['Montanari', 'M93'], ['Sassi', 'LEO'], ['Sassi', 'MF84'], ['SICOR', 'SH140']] as const) {
    const d = deriveLift({ ...L, catalog: { brand, model } }), N = d.analysis.ctx.N, c = catalogOf(brand, model)[0];
    assert.equal(d.catalog?.fit?.machine.model, model);
    assert.ok(c && c.mass === N.mass, `${model}: la massa di catalogo nel calcolo`);
    const m = machineMass(N, { brand, model }), k = massKindOf(c);
    near(m.motor, k === 'riduttore' ? motorKg(N.Pn) : 0);
    near(m.sheave, k === 'totale' ? 0 : sheaveKg(N.D, N.n, N.d));
    near(m.flywheel, k === 'riduttore' || k === 'senza_volano_puleggia' ? KM.flywheelKg : 0);
    near(m.kg, N.mass + m.motor + m.sheave + m.flywheel);
    assert.equal(m.estimate, k !== 'totale', model);
    // the beams under it carry the whole machine
    assert.equal(carriedMass(roomGeo(d.layout, d.machine), d.machine, N, { brand, model }), carriedBy(supportMass(roomGeo(d.layout, d.machine), d.machine), m.kg));
  }
  // a mass entered by hand (not the catalogue's) is the whole machine; so is the generic machine's
  const d = deriveLift({ ...L, catalog: { brand: 'Montanari', model: 'M93' } }), N = d.analysis.ctx.N;
  assert.deepEqual(machineMass({ ...N, mass: N.mass + 120 }, { brand: 'Montanari', model: 'M93' }).estimate, false);
  assert.equal(machineMass(N, null).kg, N.mass);
});

const withSupport = (support: MachineSupport) => {
  const L = defaultLift(), R = L.shaft.room;
  assert.ok(R);
  return deriveLift({ ...L, shaft: { ...L.shaft, room: { ...R, support } } });
};

test('peso proprio del basamento: plinto, telaio, putrelle, piastre, telaio con rinvio — sulla soletta (P9) e sulle travi', () => {
  const w = (s: MachineSupport | null) => {
    const d = s ? withSupport(s) : deriveLift(defaultLift());
    return { d, m: supportMass(roomGeo(d.layout, d.machine), d.machine) };
  };
  const rinvio = w(null), plinth = w({ kind: 'plinth' }), frame = w({ kind: 'frame' }), beams = w({ kind: 'beams' }), plates = w({ kind: 'plates' });
  // our bedplate with the pulley (the example's default): its irons, the pulley, its legs
  assert.equal(rinvio.m.kind, 'rinvio');
  assert.ok(rinvio.m.base > 100 && rinvio.m.base < 300, `telaio con rinvio ${rinvio.m.base}`);
  // the concrete plinth weighs most (≈ 1 t), the plates least
  assert.equal(plinth.m.kind, 'plinth');
  assert.ok(plinth.m.base > 800, `plinto ${plinth.m.base}`);
  assert.ok(plates.m.base < frame.m.base && frame.m.base < plinth.m.base, `${plates.m.base} < ${frame.m.base} < ${plinth.m.base}`);
  // the checks of the beams count their own weight: what they carry leaves it out; every other support is carried
  assert.equal(carriedBy(beams.m, 400), 400 + beams.m.maker + beams.m.frame);
  assert.equal(carriedBy(plinth.m, 400), 400 + plinth.m.base);
  // sheet 1 and the relazione: P9 = P1 (+ P2 + P3) + the machine with what carries it, static
  for (const { d, m } of [rinvio, plinth, beams]) {
    const Pl = { governorLoad: 300, safetyGear: 'progressive' as const }, R = sheetRails(d.layout, d.analysis.ctx.I.P, d.analysis.ctx.I.Q, Pl);
    const S = sheetLoads(d.analysis, d.layout, Pl, d.machine, null, 50, R), P = S.ld.P;
    near(P[8] ?? NaN, (P[0] ?? 0) + (P[1] ?? 0) + (P[2] ?? 0) + daN(S.carried + (m.kind === 'beams' ? m.base : 0) + S.hebKg), 1e-6);
    near(S.carried, carriedBy(m, S.machine.kg));
  }
});

const input = (I: ShaftInputs): TavoleInput => ({
  values: PRESETS.C, layout: layout(I), plant: { governorLoad: 300, safetyGear: 'progressive' }, marks: NO_MARKS,
  project: { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: 'Condominio' },
  company: { name: 'Ascensori di prova', logo: null }, set: { number: '26-007', issuedAt: new Date('2026-09-30T10:00:00Z'), author: 'A.C.', revisions: [] },
});

test('foglio 1: la riga del basamento con la sua massa stimata, sotto quella dell’argano', () => {
  const base = { ...defaultInputs(1740, 1445), Q: 400, access: 'none' as const }, R = base.room;
  assert.ok(R);
  const sheet1 = (I: ShaftInputs): string[] => buildTavole(input(I)).doc.pages[0]?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? [];
  const plinth = sheet1({ ...base, room: { ...R, support: { kind: 'plinth' } } });
  assert.ok(plinth.some((t) => t.startsWith('PLINTO') && t.endsWith('(STIMA)')), plinth.filter((t) => t.includes('PLINTO')).join(' | '));
  assert.ok(plinth.includes('ARGANO'), 'l’argano generico: la sua massa intera');
  // the groove's angles as the calculation checks them, to the half degree (until round 36: «95» for a β of 94,5°)
  const half = buildTavole({ ...input({ ...base, room: { ...R, support: { kind: 'plinth' } } }), values: { ...PRESETS.C, n_groove: 'UU', n_beta: 94.5 } });
  assert.ok(half.doc.pages[0]?.shapes.some((s) => s.t === 'text' && s.text === '35 - 94,5'), 'β a mezzo grado');
  // on shims with the pulley on the bedplate of the room: no support row but the pulley's
  const shims = sheet1({ ...base, room: { ...R, support: { kind: 'shims' } } });
  assert.ok(!shims.some((t) => t.startsWith('PLINTO')));
});

test('macchina in basso: tiro sugli ancoraggi alla prova 1,25·Q e con la portata per il coefficiente dinamico', () => {
  const V = { ...PRESETS.A, context: 'new', layout: 'bottom', Hv: '14' }, { I, N } = readInputs(V), r = compute(I, N);
  assert.ok(r.shaft.up);
  // the resultant with the rated load lies under the test's (1,25·Q)
  assert.ok(r.shaft.ratedKg < r.shaft.testKg);
  const a = anchorPull(r.shaft, N.mass);
  assert.ok(a);
  near(a.test, r.shaft.testKg - N.mass, 1e-9);
  near(a.dyn, KV_VERT.dynFactor * r.shaft.ratedKg - N.mass, 1e-9);
  assert.equal(a.max, Math.max(a.test, a.dyn));
  assert.ok(a.dyn > a.test, 'il coefficiente dinamico 2 sulla portata supera la prova statica');
  // the machine above pulls nothing up
  const top = compute(readInputs(PRESETS.A).I, readInputs(PRESETS.A).N);
  assert.equal(anchorPull(top.shaft, N.mass), null);
  // sheet 1 of a bottom machine: the row with the dynamic pull
  const I0 = { ...defaultInputs(1600, 1750), access: 'none' as const, room: null };
  const t = buildTavole({ ...input(I0), values: V, marks: { ...NO_MARKS, bottom: 'head' } }).doc.pages[0]?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? [];
  assert.ok(t.includes('TIRO ANCORAGGI ARGANO, PORTATA × 2,0'), 'riga del tiro dinamico');
});

test('registro: le masse stimate e il peso del basamento, ogni costante nella sua voce', () => {
  const ids = VOCI_IMPIANTO.map((v) => v.id);
  for (const v of VOCI_MASSE) assert.ok(ids.includes(v.id), v.id);
  const used = new Set(VOCI_MASSE.flatMap((v) => v.costanti ?? []));
  assert.deepEqual(Object.keys(KM).filter((k) => !used.has(k as keyof typeof KM)), []);
  const text = (id: string): string => { const v = VOCI_MASSE.find((x) => x.id === id); assert.ok(v, id); return `${v.valore} ${v.nota ?? ''}`; };
  const it = (x: number): string => String(x).replace('.', ',');
  for (const [kw, kg] of KM.motorKg) assert.ok(text('impianto.massa.argano').includes(`${it(kw)} kW ${kg} kg`), `${kw} kW`);
  assert.ok(text('impianto.massa.argano').includes(`volano ${KM.flywheelKg} kg`));
  for (const x of [KM.concreteKgM3, KM.steelKgM3]) assert.ok(text('impianto.massa.basamento').includes(`${x} kg/m³`), String(x));
  assert.ok(text('impianto.massa.basamento').includes(`${KM.plateL} × ${KM.plateW} mm`));
  assert.ok(text('impianto.massa.basamento').includes(`${it(KM.legKgM)} kg/m`));
});
