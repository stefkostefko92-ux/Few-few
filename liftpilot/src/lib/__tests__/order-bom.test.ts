// The bill and the draft order as a lift designer checks them (round 36): one rope cut length on sheet 1, in the bill,
// in the order and in the loads; the 2:1 roping's pulleys and dead ends, a machine below's head pulleys and base, the
// ropes' wedge sockets, the governor's rope, the safety gear, the counterweight's shoes, the rails in 5 m bars; the
// protection ACOP/UCM; a modification tested to UNI 10411 priced with its replaced parts only; the machine below beside
// the shaft taking only long-shaft or outboard-support variants (a standard model chosen there said so), the slow shaft's
// extension only over a maker's drawing; the machine's hand from the design and the motor's side of its shape; the
// supply and the duty in the order; a calculation with its shaft design cut as its sheet 1; the ropes the test keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountOf, throughStatic, wallVariants } from '@/lib/catalog/mounting';
import { MACHINES } from '@/lib/catalog/machines';
import { SHAPES, shapeOf } from '@/lib/catalog/shapes';
import { defaultLift, deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { ADVICE_MODELS, WALL_MODELS, liftAdvice, valuesAdvice, type MachineCandidate } from '@/lib/lift/advice';
import { choiceMachines, throughWall } from '@/lib/lift/catalog';
import type { Collaudo } from '@/lib/lift/collaudo';
import { NO_MARKS, valueMarks } from '@/lib/lift/marks';
import { KL, VOCI_IMPIANTO } from '@/lib/lift/norme';
import { layoutRigLength, rigLength } from '@/lib/lift/rope';
import { governorRopeLength, ropeCut, supportLoad } from '@/lib/lift/support';
import { buildOrder, type OrderInput } from '@/lib/order/build';
import { designWith } from '@/lib/order/drawings';
import { calcMachine, calcOrder, designOrder } from '@/lib/order/machine';
import { belowBlocks } from '@/lib/order/rows';
import { calcSite, designSite, handOf, roomHand } from '@/lib/order/site';
import { analyse } from '@/lib/present/analysis';
import { makeFmt } from '@/lib/present/tr';
import { PRICE_ARTICLES, priceArticle } from '@/lib/prices/articles';
import { calcBom, designBom } from '@/lib/prices/bom';
import { bomKind } from '@/lib/prices/bom-parts';
import type { BomLine } from '@/lib/prices/cost';
import { storedInput } from '@/lib/tavole/compose';
import { dataSheet } from '@/lib/tavole/data';
import { roomGeo, section, type Layout } from '@/shaft';
import { govSize } from '@/shaft/governor';
import { motorSide } from '@/shaft/machine-shape';
import type { FormValues } from '@/calc/types';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';
import bg from '../../../messages/bg.json';

const fmt = makeFmt('it-IT');
const below = (L: LiftInputs, scheme: 'head' | 'room' | 'under'): LiftInputs => ({ ...L, calc: { ...L.calc, layout: 'bottom' }, shaft: { ...L.shaft, room: null }, bottom: scheme });
const roped2 = (L: LiftInputs): LiftInputs => ({ ...L, calc: { ...L.calc, r: '2' } });
const tested = (L: LiftInputs, collaudo: Collaudo): LiftInputs => ({ ...L, collaudo });
const qty = (bom: readonly BomLine[], key: string): number => bom.find((l) => l.key === key)?.qty ?? 0;
const has = (bom: readonly BomLine[], prefix: string): boolean => bom.some((l) => l.key?.startsWith(prefix));

const SET = { number: '26-036', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'T', companyName: 'X', plant: {}, revisions: [],
  projectData: { name: 'x', address: null, city: null, province: null, plantNumber: null, client: null } };

/** Sheet 1 of a design's drawing set (no data of the installation). */
function sheet1(inp: LiftInputs) {
  const d = deriveLift(inp), x = storedInput(d.values, d.layout, SET, null, valueMarks(inp.auto, d, d.bottom, d.collaudo));
  assert.ok(x);
  return { d, sheet: dataSheet(x, analyse(d.values), 9).sheet };
}

/** Sheet 1 of a calculation's drawing set: its values and the shaft design it was made from, no lift design. */
function calcSheet1(V: FormValues, L: Layout, C: Collaudo) {
  const x = storedInput(V, L, SET, null, { ...NO_MARKS, collaudo: C });
  assert.ok(x);
  return dataSheet(x, analyse(V), 9).sheet;
}
const row = (rows: readonly (readonly string[])[], label: string): string => rows.find((r) => r[0] === label)?.[2] ?? '';

/** The draft order of a design for its advice's machine (or the one it verified). */
function orderOf(inp: LiftInputs, extra: Partial<OrderInput> = {}): { text: string; site: ReturnType<typeof designSite>['site'] } {
  const d = deriveLift(inp), order = designOrder(inp, liftAdvice(inp), d);
  assert.ok(order);
  const { room, site } = designSite(inp, d, order.machine, order.recorded);
  const doc = buildOrder({
    company: 'Prova', companyCity: null, logo: null, author: null, project: { name: 'P', address: null, city: null, province: null, plantNumber: null },
    record: { kind: 'design', id: 'x', sha256: 'a'.repeat(64), createdAt: new Date('2026-10-08T08:00:00Z'), label: null },
    order, room, site, collaudo: d.collaudo, generatedAt: new Date('2026-10-08T10:00:00Z'), ...extra,
  });
  const text = doc.blocks.map((b) => (b.t === 'kv' ? b.rows.flat().join(' ') : 'text' in b ? b.text : '')).join('\n');
  return { text, site };
}

test('funi: una lunghezza di taglio sul foglio 1, nella distinta, nella bozza d’ordine e nei carichi', () => {
  for (const inp of [newLift(), roped2(newLift()), below(newLift(), 'head'), below(newLift(), 'under')]) {
    const { d, sheet } = sheet1(inp), I = d.analysis.ctx.I, N = d.analysis.ctx.N, rig = rigLength(d);
    assert.ok(rig !== null);
    // the length on the pulleys plus the ends, rounded up to the metre — never shorter than the rig
    const cut = ropeCut(I, rig);
    assert.equal(cut, Math.ceil(rig + KL.ropeEnds - 1e-9));
    assert.ok(Number.isInteger(cut) && cut >= rig + KL.ropeEnds);
    assert.equal(row(sheet.specs, 'LUNGHEZZA DI TAGLIO FUNI (CIASCUNA)'), String(cut), String(inp.calc.layout));
    assert.equal(qty(designBom(d), `rope:${N.d}`), cut * N.n);
    // the ropes' mass on sheet 1 and the static load on the machine's axis the derivation weighs the support with: the
    // same cut length
    const load = (label: string): string => sheet.loads.find((r) => r[0].startsWith(label))?.[1] ?? '';
    assert.equal(load('FUNI'), fmt(N.n * N.qf * cut, 0));
    if (!d.bottom) assert.equal(load('CARICO STATICO'), fmt(supportLoad(d.analysis.ctx, d.analysis.res.Mcw, { rope: rig }).static, 0));
  }
  // the machine below: the runs to the machine make the rig longer than the formula (until round 36 sheet 1 was ~3 m short)
  const d = deriveLift(below(newLift(), 'head')), I = d.analysis.ctx.I, rig = rigLength(d);
  assert.ok(rig !== null && rig > I.r * (I.H + 2 * I.L0) + 2 * I.Hv);
  const { text } = orderOf(newLift());
  assert.match(text, /lunghezza di taglio \d+ m ciascuna/);
});

test('funi: un calcolo con il suo progetto del vano taglia come il suo foglio 1, nella distinta e nella bozza d’ordine', () => {
  const C: Collaudo = { norma: 'en81', parti: ['machine', 'ropes'] };
  for (const inp of [newLift(), roped2(newLift()), below(newLift(), 'head')]) {
    // the calculation of the advice's machine, as the calculator saves it: its order is for the machine it verified
    const d = deriveLift(inp), best = valuesAdvice(d.values).best[0];
    assert.ok(best);
    const V = { ...d.values, ...best.values }, L = d.layout, a = analyse(V), { I, N } = a.ctx, order = calcOrder(V);
    assert.ok(order?.recorded, String(inp.calc.layout));
    const rig = layoutRigLength(L, a);
    assert.ok(rig !== null);
    const cut = ropeCut(I, rig);
    assert.equal(row(calcSheet1(V, L, C).specs, 'LUNGHEZZA DI TAGLIO FUNI (CIASCUNA)'), String(cut), String(inp.calc.layout));
    assert.equal(qty(calcBom(V, C, null, L), `rope:${N.d}`), N.n * cut);
    assert.equal(calcSite(L, order.machine, V).site.ropeCut, cut);
    // without the shaft design: the formula, in the bill and in the order alike
    assert.equal(qty(calcBom(V, C), `rope:${N.d}`), N.n * ropeCut(I));
    assert.equal(calcSite(null, order.machine, V).site.ropeCut, ropeCut(I));
  }
  // the machine below: the runs to the machine, which the formula leaves out (until the review the bill and the order were
  // ~3 m short of sheet 1)
  const d = deriveLift(below(newLift(), 'head')), I = d.analysis.ctx.I, rig = layoutRigLength(d.layout, analyse(d.values));
  assert.ok(rig !== null && ropeCut(I, rig) > ropeCut(I));
});

test('foglio 1: le funi che il collaudo lascia sono esistenti, la loro massa nei carichi alla lunghezza di taglio', () => {
  const { d, sheet } = sheet1(defaultLift()), { I, N } = d.analysis.ctx, cut = ropeCut(I, rigLength(d));
  assert.ok(!d.collaudo.parti.includes('ropes'));
  assert.equal(row(sheet.specs, 'LUNGHEZZA DI TAGLIO FUNI (CIASCUNA)'), 'ESISTENTI');
  assert.ok(row(sheet.specs, 'FUNI DI SOSPENSIONE').startsWith(`${N.n} - `) && row(sheet.specs, 'FUNI DI SOSPENSIONE').endsWith(' ESISTENTI'));
  assert.equal(sheet.loads.find((r) => r[0].startsWith('FUNI'))?.[1], fmt(N.n * N.qf * cut, 0));
  const swapped = sheet1(tested(defaultLift(), { norma: '10411-1', parti: ['machine', 'ropes'] })).sheet;
  assert.equal(row(swapped.specs, 'LUNGHEZZA DI TAGLIO FUNI (CIASCUNA)'), String(cut));
  assert.ok(!row(swapped.specs, 'FUNI DI SOSPENSIONE').includes('ESISTENTI'));
});

test('distinta: taglia 2:1 — le pulegge di cabina e contrappeso, gli attacchi fissi, arcata e contrappeso per la 2:1', () => {
  const one = designBom(deriveLift(newLift())), d = deriveLift(roped2(newLift())), two = designBom(d), { I, N } = d.analysis.ctx;
  assert.equal(I.r, 2);
  assert.equal(qty(two, 'pulley:2to1'), 2);
  const p = two.find((l) => l.key === 'pulley:2to1');
  assert.deepEqual(p?.label, { item: 'pulley_2to1_spec', args: { D: String(I.Dp), n: String(N.n), d: String(N.d).replace('.', ',') } });
  assert.equal(qty(two, 'deadend:2to1'), 2);
  assert.ok(qty(two, 'sling:2to1') === 1 && qty(two, 'cw:2to1') === Math.round(d.analysis.res.Mcw));
  assert.ok(!two.some((l) => l.key === 'sling' || l.key === 'cw'));
  for (const k of ['pulley:2to1', 'deadend:2to1', 'sling:2to1', 'cw:2to1']) assert.equal(qty(one, k), 0, k);
  for (const k of ['pulley:2to1', 'deadend:2to1', 'sling:2to1', 'cw:2to1', 'pulley:head', 'base:below', 'shoes:cw', 'acop:ucm', 'acop:adapt']) assert.ok(priceArticle(k), k);
});

test('distinta: macchina in basso — le pulegge in testata con il telaio e il basamento ancorato, niente basamento di sopra', () => {
  for (const scheme of ['head', 'room', 'under'] as const) {
    const d = deriveLift(below(newLift(), scheme)), bom = designBom(d);
    assert.ok(d.headPulleys >= 2);
    assert.equal(qty(bom, 'pulley:head'), d.headPulleys, scheme);
    assert.equal(qty(bom, 'base:below'), 1);
    assert.ok(!has(bom, 'support:') && !has(bom, 'bedplate:') && !has(bom, 'heb:'));
  }
  assert.equal(qty(designBom(deriveLift(newLift())), 'base:below'), 0);
});

test('distinta: attacchi delle funi, fune del limitatore come il foglio 1, paracadute del tipo dei dati, pattini del contrappeso', () => {
  const inp = newLift(), { d, sheet } = sheet1(inp), bom = designBom(d), N = d.analysis.ctx.N, L = d.layout, V = L.inputs.vertical;
  assert.equal(qty(bom, `rope-end:${N.d}`), 2 * N.n);
  const g = govSize(V.v, L.inputs.governor), m = governorRopeLength(V, section(L).top, L.inputs.room);
  assert.equal(qty(bom, `governor-rope:${2 * g.rope}`), m);
  assert.ok(row(sheet.specs, 'FUNE DEL LIMITATORE').startsWith(`${m} - `));
  assert.ok(priceArticle(`governor-rope:${2 * g.rope}`));
  assert.equal(qty(bom, 'safety-gear:progressive'), 1);
  const inst = designBom(d, { safetyGear: 'instantaneous' });
  assert.ok(qty(inst, 'safety-gear:instantaneous') === 1 && qty(inst, 'safety-gear:progressive') === 0);
  assert.equal(qty(bom, 'shoes:cw'), 2 * L.rails.filter((r) => r.kind === 'cw').length);
});

test('ACOP/UCM: impianto nuovo un dispositivo; con la UNI 10411-11 e l’argano nuovo il loro adeguamento; con la -1 nulla in distinta', () => {
  assert.equal(qty(designBom(deriveLift(newLift())), 'acop:ucm'), 1);
  const m1 = designBom(deriveLift(defaultLift()));
  assert.ok(!has(m1, 'acop:'));
  const m11 = designBom(deriveLift(tested(defaultLift(), { norma: '10411-11', parti: ['machine'] })));
  assert.ok(qty(m11, 'acop:adapt') === 1 && !has(m11, 'acop:ucm'));
  // the order: how ACOP and UCM are made (never the motor's brake), or the existing ones kept working
  const nuovo = orderOf(newLift()).text;
  for (const s of ['5.6.6.4 e 5.6.7.4', 'non il freno dell’albero del motore', 'bloccafuni certificato', 'paracadute di cabina bidirezionale', 'Certificato di esame UE del tipo', '6.3.11–6.3.13']) {
    assert.ok(nuovo.includes(s), s);
  }
  assert.ok(orderOf(defaultLift()).text.includes('UNI 10411-1:2024, 14.4 c), d) e g)'));
  assert.ok(orderOf(tested(defaultLift(), { norma: '10411-11', parti: ['machine'] })).text.includes('UNI 10411-11:2024, 14.3 a) e b)'));
  assert.ok(!orderOf(tested(defaultLift(), { norma: '10411-1', parti: ['ropes'] })).text.includes('ACOP'));
});

test('modifica (UNI 10411): la distinta delle sole parti sostituite, la manodopera a corpo', () => {
  const d = deriveLift(defaultLift()), bom = designBom(d);
  assert.deepEqual(d.collaudo.parti, ['machine']);
  assert.equal(bomKind(d.collaudo), 'replacement');
  assert.ok(has(bom, 'machine') || bom.some((l) => l.label.item === 'machine_other'));
  for (const p of ['rail:', 'fishplate:', 'bracket:', 'panev:', 'door:', 'governor', 'tension', 'buffer', 'car', 'sling', 'cw', 'controller', 'rope:', 'safety-gear:', 'shoes:', 'labour:installer', 'labour:rails']) {
    assert.ok(!has(bom, p), p);
  }
  assert.equal(bom.find((l) => l.key === 'labour:replacement')?.unit, 'lot');
  // with the rails and the ropes replaced: those, with their joints, brackets, cleaning, wedge sockets
  const more = designBom(deriveLift(tested(defaultLift(), { norma: '10411-1', parti: ['machine', 'rails', 'ropes'] })));
  for (const p of ['rail:', 'fishplate:', 'bracket:', 'labour:rails', 'rope:', 'rope-end:']) assert.ok(has(more, p), p);
  assert.ok(!has(more, 'door:') && !has(more, 'labour:installer'));
  // a new lift: everything, the installer by the stop
  const all = designBom(deriveLift(newLift()));
  assert.equal(bomKind(deriveLift(newLift()).collaudo), 'full');
  for (const p of ['rail:', 'door:', 'car', 'sling', 'cw', 'controller', 'labour:installer']) assert.ok(has(all, p), p);
  assert.ok(!has(all, 'labour:replacement'));
});

test('macchina in basso accanto al vano: solo varianti ad albero lungo o con supporto esterno, al carico statico con l’albero più lungo', () => {
  assert.ok(throughWall('bottom', 'head') && throughWall('bottom', 'room') && throughWall('bottom', undefined));
  assert.ok(!throughWall('bottom', 'under') && !throughWall('topDefl', 'head'));
  const wall = choiceMachines({ brand: 'SICOR', wall: true }), plain = choiceMachines({ brand: 'SICOR' });
  assert.ok(wall.length && wall.every((c) => mountOf(c)), wall.map((c) => c.model).join());
  assert.equal(wall.find((c) => c.model === 'SH140LS')?.staticKg, 1500);
  assert.equal(wall.find((c) => c.model === 'SH160LS')?.staticKg, 3200);
  assert.ok(!plain.some((c) => c.model.endsWith('LS')), 'le varianti ad albero lungo solo per nome sopra il vano');
  for (const c of MACHINES) if (mountOf(c)?.byLength) assert.equal(throughStatic(c), Math.min(...(mountOf(c)?.byLength ?? [])));
  // the advice: the wall's models, every candidate a long-shaft or outboard-support one
  const A = liftAdvice(below(newLift(), 'head'));
  assert.ok(A.wall && A.models === WALL_MODELS && A.candidates.length > 0);
  assert.ok(A.candidates.every((c) => mountOf(c)), A.candidates.map((c) => c.model).join());
  assert.ok(A.candidates.every((c) => c.staticKg >= c.testKg));
  const U = liftAdvice(below(newLift(), 'under'));
  assert.ok(!U.wall && U.models === ADVICE_MODELS);
  // a standard machine named for the wall does not take it: the choice misses for the wall, not for the checks, and the
  // screen names the maker's variants (or says it has none)
  const named = deriveLift({ ...below(newLift(), 'head'), catalog: { brand: 'SICOR', model: 'SH140' } });
  assert.ok(named.catalog?.miss === 'wall' && named.catalog.fit === null);
  assert.equal(deriveLift({ ...below(newLift(), 'head'), catalog: { brand: 'Sassi' } }).catalog?.miss, 'wall');
  assert.equal(deriveLift({ ...below(newLift(), 'under'), catalog: { brand: 'SICOR', model: 'SH140' } }).catalog?.miss === 'wall', false);
  assert.deepEqual(wallVariants('SICOR', 'SH140'), ['SH140LS']);
  assert.ok(['M75S', 'M75AL'].every((m) => wallVariants('Montanari', 'M75').includes(m)) && !wallVariants('Montanari', 'M75').includes('M93AL'));
  assert.ok(wallVariants('Montanari', 'M65').length > 2 && wallVariants('Montanari', 'M65').every((m) => mountOf({ brand: 'Montanari', model: m })));
  assert.deepEqual(wallVariants('Sassi'), []);
  for (const m of [it, en, bg]) {
    const lift = (m as unknown as { lift: Record<string, string> }).lift;
    assert.ok(lift.cat_miss_wall.includes('{brand}') && lift.cat_miss_wall.includes('{variants}') && lift.cat_miss_wall_none.includes('{brand}'));
  }
  // the calculator's values with the advice's machine through the wall: recognised in the saved calculation
  const V = deriveLift(below(newLift(), 'head')).values, va = valuesAdvice(V), best = va.best[0];
  assert.ok(va.wall && best && mountOf(best));
  const saved = calcMachine({ ...V, ...best.values });
  assert.deepEqual(saved && [saved.brand, saved.model, saved.staticKg], [best.brand, best.model, best.staticKg]);
});

test('bozza d’ordine, macchina in basso accanto al vano: l’allungamento dell’albero solo sul disegno del costruttore', () => {
  const inp = below(newLift(), 'head'), d = deriveLift(inp), A = liftAdvice(inp);
  const site = (c: MachineCandidate) => designSite(inp, d, c, false).site;
  const text = (c: MachineCandidate): string => belowBlocks(c, site(c), fmt).flatMap((b) => (b.t === 'kv' ? b.rows.flat() : [])).join(' ');
  // a long-shaft variant (drawn as the generic machine): what does not depend on its body, to be checked on its drawing
  const long = A.candidates.find((c) => mountOf(c)?.kind === 'long'), drawn = A.candidates.find((c) => shapeOf(c.brand, c.model) && mountOf(c)?.kind === 'support');
  assert.ok(long && drawn, A.candidates.map((c) => c.model).join());
  const t = site(long).through;
  assert.ok(t && t.ext === null && t.reach === t.inner + t.wall + KL.faceGap && t.inner > KL.bottomClear, JSON.stringify(t));
  assert.ok(text(long).includes(`piano medio della puleggia a ${t.inner} mm dalla faccia del muro verso il vano`) && text(long).includes(`almeno ${t.reach} mm`));
  assert.ok(text(long).includes('da verificare con il disegno del costruttore') && !text(long).includes('più lungo'));
  // a support variant drawn as it is: its overhang and the extension over the maker's shaft
  const u = site(drawn).through;
  assert.ok(u && u.ext !== null && u.ext > 0 && u.overhang >= u.reach, JSON.stringify(u));
  assert.ok(text(drawn).includes(`albero più lungo di ${u.ext} mm rispetto al disegno del costruttore`));
  // under the pit nothing goes through a wall
  const under = below(newLift(), 'under'), du = deriveLift(under), cu = liftAdvice(under).best[0];
  assert.ok(cu);
  assert.equal(designSite(under, du, cu, false).site.through, null);
});

test('esecuzione dell’argano: dal progetto, guardando dal lato della puleggia', () => {
  // the motor to the observer's right when looking at the sheave's side toward the gearbox
  assert.equal(handOf([1, 0], [0, -1]), 'destra');
  assert.equal(handOf([-1, 0], [0, -1]), 'sinistra');
  // turned round by 180° the machine keeps its hand
  for (const motor of ['cw', 'car'] as const) {
    const inp = newLift(), R = inp.shaft.room;
    assert.ok(R);
    const d = deriveLift({ ...inp, shaft: { ...inp.shaft, room: { ...R, motor } } }), G = roomGeo(d.layout, d.machine);
    assert.ok(G);
    assert.equal(roomHand(G), 'destra', motor);
  }
  const o = orderOf(newLift());
  assert.equal(o.site.hand, 'destra');
  assert.ok(o.text.includes('☒ destra   ☐ sinistra — dal progetto') && o.text.includes('da confermare con lo schema di esecuzione del costruttore'));
  assert.equal(orderOf(below(newLift(), 'head')).site.hand, 'destra');
  // a calculation without a shaft design: blank
  const d = deriveLift(defaultLift()), order = designOrder(defaultLift(), liftAdvice(defaultLift()), d);
  assert.ok(order);
  assert.equal(calcSite(null, order.machine, d.values).site.hand, null);
  assert.equal(calcSite(d.layout, order.machine, d.values).site.hand, 'destra');
  // the motor's side is the shape's: SICOR's SV110 (vertical worm) has it at −X, every other maker's at +X
  assert.equal(motorSide(shapeOf('SICOR', 'SV110')), -1);
  assert.equal(motorSide(null), 1);
  for (const S of SHAPES) if (S.model !== 'SV110') assert.equal(motorSide(S), 1, `${S.brand} ${S.model}`);
  const small: LiftInputs = { ...newLift(), shaft: { ...newLift().shaft, Q: 320 } }, ds = deriveLift(small), sv = liftAdvice(small).candidates.find((c) => c.model === 'SV110');
  assert.ok(sv, 'SV110 tra i candidati');
  assert.equal(designSite(small, ds, sv, false).site.hand, 'sinistra');
  // its drawing in the room: the motor's parts on the other side of the sheave's axis than a horizontal worm's
  const x = designWith(small, ds, sv, false), G = roomGeo(x.layout, x.machine);
  assert.ok(G && G.frame.shape?.model === 'SV110' && roomHand(G) === 'sinistra');
  assert.ok(orderOf(small).text.includes('☐ destra   ☒ sinistra — dal progetto: motore a sinistra'));
});

test('bozza d’ordine: alimentazione e servizio dai dati dell’impianto, altrimenti i valori usuali segnati', () => {
  const plain = orderOf(newLift()).text;
  assert.ok(plain.includes('400 V trifase, 50 Hz (valori usuali: da confermare con i dati dell’impianto)'));
  for (const s of ['avviamenti all’ora', 'rapporto di intermittenza', 'grado di protezione IP', 'bobina', 'microinterruttori di controllo su ogni gruppo', 'leva manuale', 'encoder', 'volano']) {
    assert.ok(plain.includes(s), s);
  }
  assert.ok(!plain.includes('Volano, encoder, sblocco manuale del freno'));
  const given = orderOf(newLift(), { plant: { voltage: 230, frequency: 60, duty: 40, lightVoltage: 230 } }).text;
  assert.ok(given.includes('230 V trifase, 60 Hz (dati dell’impianto); luce 230 V') && given.includes('rapporto di intermittenza 40 %'));
});

test('registro: la lunghezza di taglio, l’albero prolungato, ACOP/UCM, l’esecuzione, la distinta', () => {
  const text = (id: string): string => VOCI_IMPIANTO.find((v) => v.id === id)?.valore ?? '';
  assert.ok(text('impianto.funi.taglio').includes(`più ${String(KL.ropeEnds).replace('.', ',')} m per i due attacchi`));
  assert.ok(text('impianto.basso.albero').includes('SH140LS 1500 kg') && text('impianto.basso.albero').includes('SH160LS 3200 kg'));
  assert.ok(text('impianto.basso.albero').includes(`a ${KL.faceGap} mm dal muro`) && text('ordine.esecuzione').includes('SV110'));
  assert.ok(text('impianto.funi.taglio').includes('un calcolo fatto da un progetto del vano') && text('impianto.funi.taglio').includes('come esistenti'));
  for (const id of ['impianto.acop.ucm', 'ordine.esecuzione', 'impianto.distinta']) assert.ok(text(id), id);
  assert.equal(VOCI_IMPIANTO.find((v) => v.id === 'impianto.funi.taglio')?.stato, 'prassi');
  assert.equal(VOCI_IMPIANTO.find((v) => v.id === 'impianto.basso.albero')?.stato, 'da_verificare');
  // every article the bill can write is in the list
  for (const k of ['rope-end:10', 'governor-rope:6', 'safety-gear:roller']) assert.ok(PRICE_ARTICLES.some((a) => a.key === k), k);
});
