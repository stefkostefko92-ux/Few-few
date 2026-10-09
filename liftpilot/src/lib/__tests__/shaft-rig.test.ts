// The lift's rope rig in the shaft (shaft/shaft-rig.ts, lib/lift/shaft-rig.ts): the shaft's sheets and the spaces on the
// car roof see what the 3D builds — the head pulleys of a machine below where the rope rig turns the ropes, the dead
// ends of a 2:1 roping under the slab —; the refuge on the roof is measured to what hangs there (h_refuge_rig,
// h_stand_rig in place of the shaft's h_refuge and h_stand, in the acceptance test with a new machine) with the headroom
// that clears it; sheet 1 notes the room each scheme draws; with the machine under the pit the
// counterweight has its safety gear (sg_cw) and its rails its load (P7); the sheets draw the rig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { defaultLift, deriveLift, newLift, planeAt, ropeRig, type LiftInputs } from '@/lib/lift';
import { ambitoOf, collaudoOf, collaudoVerdict } from '@/lib/lift/collaudo';
import { BOTTOM_SCHEMES, type BottomScheme } from '@/lib/lift/bottom';
import { NO_MARKS } from '@/lib/lift/marks';
import { analyse } from '@/lib/present/analysis';
import { buildReport } from '@/lib/report/build';
import { buildTavole, specs } from '@/lib/tavole/build';
import { cwGearChecks, cwGearOf, cwGearPicked, cwGearRow } from '@/lib/tavole/cw-gear';
import { dataSheet } from '@/lib/tavole/data';
import type { TavoleInput } from '@/lib/tavole/input';
import { loads } from '@/lib/tavole/loads';
import { clientNotes } from '@/lib/tavole/notes';
import { defaultInputs, layout, mergeChecks, section, type ShaftInputs } from '@/shaft';
import { hangingOf } from '@/shaft/shaft-rig';

const below = (scheme: BottomScheme, headroom?: number, start: LiftInputs = newLift()): LiftInputs => {
  const b = start, V = b.shaft.vertical;
  return { ...b, calc: { ...b.calc, layout: 'bottom' }, bottom: scheme, shaft: headroom === undefined ? b.shaft : { ...b.shaft, vertical: { ...V, headroom } } };
};
const twoToOne = (): LiftInputs => {
  const b = newLift();
  return { ...b, calc: { ...b.calc, r: '2' } };
};

test('la taglia nel vano come il 3D: i rinvii della macchina in basso, la puleggia di trazione, il limitatore', () => {
  for (const scheme of BOTTOM_SCHEMES) {
    const d = deriveLift(below(scheme)), rig = d.layout.rig, R = ropeRig(d, scheme);
    assert.ok(rig, scheme);
    const tops = R.wheels.filter((w) => w.role === 'top').map((w) => ({ c: planeAt(w.plane, w.u), z: w.y * 1000 }));
    assert.equal(rig.head.length, tops.length, `${scheme}: rinvii`);
    for (const p of rig.head) {
      assert.ok(tops.some((t) => Math.hypot(t.c[0] - p.c[0], t.c[1] - p.c[1]) < 1 && Math.abs(t.z - p.z) < 1), `${scheme}: rinvio a ${p.c.map(Math.round)} z ${Math.round(p.z)}`);
    }
    assert.ok(Math.abs(rig.downTo - R.sheave.y * 1000) < 1, `${scheme}: le funi fino all’asse della puleggia di trazione`);
    // hung under the slab (head, under) or standing in the pulley room over it, with the slab's openings
    assert.equal(rig.hung, scheme !== 'room');
    assert.equal((rig.holes ?? []).length > 0, scheme === 'room', `${scheme}: aperture nella soletta`);
    if (scheme === 'room') assert.equal(rig.governor, null, 'il limitatore nel locale delle pulegge');
  }
  // 2:1 with the machine above: the car's and the counterweight's pulleys, the dead ends anchored under the slab
  const d = deriveLift(twoToOne()), rig = d.layout.rig, S = section(d.layout);
  assert.ok(rig && rig.car && rig.cw);
  assert.deepEqual(rig.dead.map((e) => e.tag), ['P2', 'P3']);
  for (const e of rig.dead) assert.equal(e.z, S.ceiling - 190);
  assert.equal(hangingOf(rig).length, 2, 'appesi: i due attacchi');
  // 1:1 with the machine above: nothing of the rig hangs in the shaft
  const one = deriveLift(newLift()).layout.rig;
  assert.ok(one && !one.car && !one.dead.length && hangingOf(one).length === 0);
});

test('rifugio sul tetto sotto i rinvii appesi: verificato fino a ciò che pende, con l’altezza di testata che lo libera', () => {
  for (const scheme of ['head', 'under'] as const) {
    const d = deriveLift(below(scheme)), ck = (id: string) => d.supportChecks.find((c) => c.id === id);
    assert.ok(ck('h_hung'), `${scheme}: la traversa sotto i rinvii`);
    assert.ok(ck('h_refuge_rig') && ck('h_stand_rig'), `${scheme}: il rifugio misurato sotto ciò che pende`);
    assert.ok(d.refugeHead, `${scheme}: la testata del progetto non basta`);
    assert.ok(ck('h_refuge_rig')?.status === 'fail' || ck('h_stand_rig')?.status === 'fail');
    // in place of the shaft's own, where it had them
    const all = mergeChecks(d.layout.checks, d.supportChecks).map((c) => c.id);
    assert.ok(!all.includes('h_refuge') && !all.includes('h_stand') && all.includes('h_refuge_rig') && all.includes('h_stand_rig'), scheme);
    assert.equal(all.indexOf('h_refuge_rig'), d.layout.checks.findIndex((c) => c.id === 'h_refuge'), `${scheme}: al posto di h_refuge`);
    assert.ok(d.refugeHead.need > d.refugeHead.now && d.refugeHead.need % 10 === 0);
    // with the headroom the hint gives the refuge clears what hangs
    const e = deriveLift(below(scheme, d.refugeHead.need)), ok = (id: string) => e.supportChecks.find((c) => c.id === id)?.status;
    assert.equal(ok('h_refuge_rig'), 'ok', `${scheme}: h_refuge_rig con ${d.refugeHead.need}`);
    assert.equal(ok('h_stand_rig'), 'ok', `${scheme}: h_stand_rig con ${d.refugeHead.need}`);
    assert.equal(e.refugeHead, null);
  }
  // the pulleys over the slab in their room, the machine above at 1:1: nothing hangs, the shaft's own checks stand
  for (const inp of [below('room'), newLift()]) {
    const d = deriveLift(inp);
    assert.equal(d.refugeHead, null);
    assert.ok(!d.supportChecks.some((c) => c.id === 'h_hung' || c.id === 'h_refuge_rig' || c.id === 'h_stand_rig'));
  }
  // a headroom too low for the refuge under the slab alone (1:1, the machine above): the shaft's h_refuge says so, the
  // hint about what hangs does not
  const low = newLift(), lowD = deriveLift({ ...low, shaft: { ...low.shaft, vertical: { ...low.shaft.vertical, headroom: 3300 } } });
  assert.equal(lowD.layout.checks.find((c) => c.id === 'h_refuge')?.status, 'fail');
  assert.equal(lowD.refugeHead, null, 'niente appeso: nessuna testata per ciò che pende');
});

test('collaudo: il rifugio sotto ciò che pende entra con la macchina sostituita, quello del vano resta esistente', () => {
  // a modification to UNI 10411-1 replacing the machine with one below and hung pulleys: the refuge under them fails and
  // fails the test, as h_hung would
  const d = deriveLift(below('head', undefined, defaultLift())), C = d.collaudo;
  assert.equal(C.norma, '10411-1');
  assert.deepEqual(C.parti, ['machine']);
  const all = [...d.analysis.res.checks, ...mergeChecks(d.layout.checks, d.supportChecks)];
  const rig = all.filter((c) => c.id === 'h_refuge_rig' || c.id === 'h_stand_rig');
  assert.equal(rig.length, 2);
  assert.ok(rig.some((c) => c.status === 'fail'), 'il rifugio non passa sotto i rinvii appesi');
  for (const c of rig) assert.equal(ambitoOf(C, c.id), 'applies', c.id);
  assert.equal(collaudoVerdict(C, all).verdict, 'fail');
  assert.ok(collaudoVerdict(C, all).fails > collaudoVerdict(C, all.filter((c) => !rig.includes(c))).fails, 'conta nel collaudo');
  // the shaft's own refuge stays with the car and its frame: a machine replaced above leaves it existing
  for (const id of ['h_refuge', 'h_stand'] as const) assert.equal(ambitoOf(C, id), 'existing', id);
  // a modification that replaces only the controller leaves the rig's refuge existing too
  for (const id of ['h_refuge_rig', 'h_stand_rig'] as const) assert.equal(ambitoOf({ ...C, parti: ['controller'] }, id), 'existing', id);
});

test('foglio 1: una nota per ogni locale che le tavole disegnano, e i fogli del locale in basso la richiamano', () => {
  const L = deriveLift(below('head')).layout, room = layout({ ...defaultInputs(1600, 1750) });
  const titles = (Lx: typeof L, scheme: BottomScheme | null, existing = false): string[] =>
    clientNotes(Lx, scheme !== null, { scheme: scheme ?? undefined, existing }).map((n) => n.title);
  assert.deepEqual(titles(L, 'head'), ['VANO DI CORSA', 'LOCALE MACCHINA IN BASSO', 'PULEGGE DI RINVIO APPESE SOTTO LA SOLETTA', 'ARMADIO DEL QUADRO (SE PRESENTE)']);
  assert.deepEqual(titles(L, 'under'), ['VANO DI CORSA', 'LOCALE MACCHINA SOTTO IL VANO', 'PULEGGE DI RINVIO APPESE SOTTO LA SOLETTA', 'SPAZIO ACCESSIBILE SOTTO IL VANO',
    'ARMADIO DEL QUADRO (SE PRESENTE)']);
  assert.deepEqual(titles(room, 'room'), ['VANO DI CORSA', 'LOCALE MACCHINA IN BASSO', 'LOCALE DELLE PULEGGE DI RINVIO', 'ARMADIO DEL QUADRO (SE PRESENTE)']);
  // a modification keeps the rooms there are (UNI 10411-1/-11, 9.2)
  assert.deepEqual(titles(room, 'room', true).slice(1, 3), ['LOCALE MACCHINA IN BASSO (ESISTENTE)', 'LOCALE DELLE PULEGGE DI RINVIO (ESISTENTE)']);
  assert.ok(titles(room, null).includes('LOCALE DELLA MACCHINA E DEI RINVII') || titles(room, null).some((t) => t.startsWith('LOCALE DELLA MACCHINA')));
  // the room's sheets name the note
  for (const scheme of BOTTOM_SCHEMES) {
    const s = specs(L, false, scheme).filter((x) => x.k === 'below-plan' || x.k === 'below-section');
    assert.equal(s.length, 2);
    for (const x of s) assert.match('subtitle' in x ? x.subtitle ?? '' : '', /REQUISITI DEL LOCALE: NOTA 2 DEL FOGLIO 1/, scheme);
  }
});

test('macchina sotto la fossa: paracadute del contrappeso dichiarato e verificato (sg_cw), la sua presa sulle guide in P7', () => {
  // the check: given, tripped by what the speed allows, a pillar only in a modification; nothing without a space under
  assert.deepEqual(cwGearChecks(false, {}, 1, false), []);
  assert.equal(cwGearChecks(true, {}, 1, false)[0]?.status, 'fail');
  assert.equal(cwGearChecks(true, { cwSafetyGear: 'progressive' }, 1, false)[0]?.status, 'fail', 'manca l’azionamento');
  assert.equal(cwGearChecks(true, { cwSafetyGear: 'progressive', cwGearTrip: 'governor' }, 1.6, false)[0]?.status, 'ok');
  assert.equal(cwGearChecks(true, { cwSafetyGear: 'instantaneous', cwGearTrip: 'governor' }, 1, false)[0]?.status, 'ok');
  assert.equal(cwGearChecks(true, { cwSafetyGear: 'instantaneous', cwGearTrip: 'governor' }, 1.6, false)[0]?.status, 'fail');
  assert.equal(cwGearChecks(true, { cwSafetyGear: 'progressive', cwGearTrip: 'rupture' }, 1.6, false)[0]?.status, 'fail');
  assert.equal(cwGearChecks(true, { cwSafetyGear: 'pillar' }, 1, true)[0]?.status, 'ok');
  assert.equal(cwGearChecks(true, { cwSafetyGear: 'pillar' }, 1, false)[0]?.status, 'fail');
  assert.equal(cwGearRow({}), 'OBBLIGATORIO, DA INDICARE (5.2.5.4)');
  assert.equal(cwGearRow({ cwSafetyGear: 'progressive', cwGearTrip: 'governor' }), 'PROGRESSIVO DA LIMITATORE');
  // P7: the rails alone, or with the gear's operation on half the counterweight (progressive when not given)
  assert.equal(cwGearOf(false, { cwSafetyGear: 'instantaneous' }), null);
  assert.equal(cwGearOf(true, {}), 'progressive');
  assert.equal(cwGearOf(true, { cwSafetyGear: 'pillar' }), null);
  const base = {
    P: 520, Q: 400, Mcw: 720, ropes: 10, cables: 25, machine: 420, roping: 1, carRailQ: 8.32, carRailLen: 22.5, cwRailQ: 3.34, cwRailLen: 22.5,
    safetyGear: 'progressive' as const, dyn: 1.5, carBuffers: 2, cwBuffers: 1, governor: 300,
  };
  const rails = loads(base).P[6] ?? 0, gear = loads({ ...base, cwGear: 'progressive' }).P[6] ?? 0, inst = loads({ ...base, cwGear: 'instantaneous' }).P[6] ?? 0;
  assert.ok(Math.abs(rails - (3.34 * 22.5 * 9.81) / 10) < 1e-6);
  assert.ok(gear > rails + (720 / 2) * 0.981 && inst > gear);
  // on sheet 1: the row, the check and P7 as the plant data give them
  const sheet = (scheme: BottomScheme, plant: TavoleInput['plant']) => {
    const I: ShaftInputs = { ...defaultInputs(1600, 1750), access: 'none', room: null };
    const x: TavoleInput = {
      values: { ...PRESETS.A, context: 'new', layout: 'bottom', Hv: '14' }, layout: layout(I), plant: { governorLoad: 300, safetyGear: 'progressive', ...plant },
      marks: { ...NO_MARKS, bottom: scheme },
      project: { name: 'Prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: 'Condominio' },
      company: { name: 'Ascensori di prova', logo: null }, set: { number: '26-036', issuedAt: new Date('2026-10-08T10:00:00Z'), author: 'A.C.', revisions: [] },
    };
    return dataSheet(x, analyse(x.values), 10).sheet;
  };
  const row = (s: ReturnType<typeof sheet>) => s.specs.find((r) => r[0] === 'PARACADUTE CONTRAPPESO');
  const sg = (s: ReturnType<typeof sheet>) => s.checks.find((r) => /contrappeso/i.test(r[0]) && /paracadute/i.test(r[0]));
  const under = sheet('under', {}), given = sheet('under', { cwSafetyGear: 'progressive', cwGearTrip: 'governor' }), head = sheet('head', {});
  assert.equal(row(under)?.[2], 'OBBLIGATORIO, DA INDICARE (5.2.5.4)');
  assert.equal(sg(under)?.[3], 'NON PASSA');
  assert.equal(row(given)?.[2], 'PROGRESSIVO DA LIMITATORE');
  assert.equal(sg(given)?.[3], 'OK');
  assert.equal(row(head), undefined);
  assert.equal(sg(head), undefined);
  assert.ok(Number(String(under.P[6]).replace(/\D/g, '')) > Number(String(head.P[6]).replace(/\D/g, '')), 'P7 con la presa');
});

test('paracadute del contrappeso: scelto il pilastro, l’azionamento scelto prima non resta dietro il campo disattivato', () => {
  const tripped = { cwSafetyGear: 'instantaneous' as const, cwGearTrip: 'rupture' as const, control: 'APB' };
  // a pillar: nothing trips it, the choice goes away with the gear; the rest of the data stays as it was
  assert.deepEqual(cwGearPicked(tripped, 'pillar'), { cwSafetyGear: 'pillar', cwGearTrip: undefined, control: 'APB' });
  // a gear chosen (or none) keeps what trips it: the two fields are filled in either order
  assert.deepEqual(cwGearPicked(tripped, 'progressive'), { ...tripped, cwSafetyGear: 'progressive' });
  assert.deepEqual(cwGearPicked({ cwGearTrip: 'governor' }, undefined), { cwGearTrip: 'governor', cwSafetyGear: undefined });
  // and sheet 1 reads the pillar alone, as before
  assert.equal(cwGearRow(cwGearPicked(tripped, 'pillar')), 'PILASTRO ESISTENTE FINO AL TERRENO');
});

test('relazione: lo spazio sotto il vano come il foglio 1 (fondo della fossa, P5–P8, paracadute dai dati, pilastro solo in una modifica)', () => {
  const item = (context: 'new' | 'repl'): string => {
    const values = { ...PRESETS.A, context, layout: 'bottom', Hv: '14' };
    const doc = buildReport({
      calc: { id: 'cmtest0036', label: null, createdAt: new Date('2026-10-08T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
      project: { name: 'Prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: null }, company: 'Ditta di prova',
      values, reviews: [], generatedAt: new Date('2026-10-08T09:00:00Z'), marks: { ...NO_MARKS, bottom: 'under', collaudo: collaudoOf(values) },
    });
    return doc.blocks.flatMap((b) => (b.t === 'list' ? b.items : [])).find((x) => x.includes('Spazio accessibile sotto il vano')) ?? '';
  };
  const n = item('new'), r = item('repl');
  for (const x of [n, r]) {
    assert.match(x, /almeno 5000 N\/m² oltre ai carichi P5–P8/);
    assert.match(x, /tipo e azionamento si indicano nei dati dell’impianto/);
    assert.doesNotMatch(x, /non ammette più il pilastro/);
  }
  assert.doesNotMatch(n, /pilastro/, 'impianto nuovo: solo il paracadute');
  assert.match(r, /pilastro esistente fino al terreno .*\(UNI 10411-1:2024, 6\.14\)/, 'modifica: il pilastro esistente come la nota del foglio 1');
});

test('i fogli del vano disegnano la taglia: gli attacchi della 2:1 (P2, P3), i rinvii e il limitatore della macchina in basso (P1, P4)', () => {
  // the shaft's sheets (2 to 7: plans and section A-A) with the loads' tags of what the rig hangs in the shaft
  const tags = (inp: LiftInputs): string[] => tavoleTexts(inp).slice(1, 7).flat().filter((t) => /^P\d$/.test(t));
  assert.deepEqual(tags(newLift()), [], '1:1 con la macchina sopra: niente nel vano');
  const two = tags(twoToOne()), head = tags(below('head'));
  assert.ok(two.includes('P2') && two.includes('P3'), `2:1: ${two.join(',')}`);
  assert.ok(head.includes('P1') && head.includes('P4'), `in basso: ${head.join(',')}`);
});

/** The texts of each sheet of a lift design's drawing set. */
function tavoleTexts(inp: LiftInputs): string[][] {
  const d = deriveLift(inp);
  const x: TavoleInput = {
    values: d.values, layout: d.layout, plant: { governorLoad: 300, safetyGear: 'progressive' }, marks: { ...NO_MARKS, bottom: d.bottom ?? undefined },
    project: { name: 'Prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: 'Condominio' },
    company: { name: 'Ascensori di prova', logo: null }, set: { number: '26-036', issuedAt: new Date('2026-10-08T10:00:00Z'), author: 'A.C.', revisions: [] },
  };
  return buildTavole(x).doc.pages.map((p) => p.shapes.flatMap((sh) => (sh.t === 'text' ? [sh.text] : [])));
}
