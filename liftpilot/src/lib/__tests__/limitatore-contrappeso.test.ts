// Round 37: the governor's model by its maker's range of rated speeds and the tripping speed to set for the speed and
// the car's safety gear, on sheet 1, in the relazione and in the bill (W2-G3-01); the governor rope's safety factor and
// the tripping force as the suppliers' data to check (W2-G3-05); the counterweight's rails under the grip of its safety
// gear, buckling and guiding forces (W2-G3-04).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { NO_MARKS, valueMarks } from '@/lib/lift/marks';
import { analyse } from '@/lib/present/analysis';
import { designBom } from '@/lib/prices/bom';
import { buildReport } from '@/lib/report/build';
import type { ReportDoc } from '@/lib/report/model';
import { cwRailCheck, cwRailChecks } from '@/lib/tavole/cw-rail-check';
import { dataSheet } from '@/lib/tavole/data';
import { tripRange, tripText } from '@/lib/tavole/governor-trip';
import type { TavoleInput } from '@/lib/tavole/input';
import type { Plant } from '@/lib/plant';
import { GOVERNORS, KV_VERT, SHAFT_ENGINE_VERSION, VOCI_VANO, defaultInputs, govSize, layout, takesSpeed, tripWindow, type ShaftInputs } from '@/shaft';

const near = (a: number, b: number, tol: number, what: string): void => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} invece di ${b}`);
const voce = (id: string) => {
  const v = VOCI_VANO.find((x) => x.id === id);
  assert.ok(v, id);
  return v;
};

/** Sheet 1 of a machine below (`scheme`), with the data of the installation `plant`. */
function sheet(scheme: 'head' | 'under', plant: Plant, v = 1, cwRail: ShaftInputs['cwRail'] = 'T45/A') {
  const S0 = defaultInputs(1600, 1750), I: ShaftInputs = { ...S0, access: 'none', room: null, cwRail, vertical: { ...S0.vertical, v } };
  const x: TavoleInput = {
    values: { ...PRESETS.A, context: 'new', layout: 'bottom', Hv: '14', v }, layout: layout(I), plant: { governorLoad: 300, ...plant },
    marks: { ...NO_MARKS, bottom: scheme },
    project: { name: 'Prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: 'Condominio' },
    company: { name: 'Ascensori di prova', logo: null }, set: { number: '26-037', issuedAt: new Date('2026-10-09T10:00:00Z'), author: 'A.C.', revisions: [] },
  };
  return dataSheet(x, analyse(x.values), 10).sheet;
}

/** The relazione of a lift design with the data of the installation `plant`. */
function relazione(inp: LiftInputs, plant: Plant): string {
  const d = deriveLift(inp), DAY = new Date('2026-10-09T08:00:00Z');
  const doc: ReportDoc = buildReport({
    calc: { id: 'cmtest0037', label: null, createdAt: DAY, sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project: { name: 'Prova', address: null, city: 'Monza', province: 'MB', plantNumber: null, client: null }, company: 'Ditta di prova', values: d.values,
    reviews: [], marks: valueMarks(inp.auto, d, d.bottom, d.collaudo), plant, drawings: [],
    design: { id: 'cmdesign37', label: null, createdAt: DAY, sha256: 'e'.repeat(64), engineVersion: SHAFT_ENGINE_VERSION, profileId: 'IT-2026.1', author: null, layout: d.layout, source: null },
  });
  return JSON.stringify(doc);
}

const withV = (L: LiftInputs, v: number): LiftInputs => ({ ...L, shaft: { ...L.shaft, vertical: { ...L.shaft.vertical, v } } });
const under = (L: LiftInputs): LiftInputs => ({ ...L, calc: { ...L.calc, layout: 'bottom' }, shaft: { ...L.shaft, room: null }, bottom: 'under' });

test('limitatore: il modello scelto solo nel campo di velocità del costruttore, la velocità d’intervento da tarare', () => {
  // Montanari's RC from 1,60 m/s: at 0,63 m/s the series by the speed; at 2 m/s the one chosen
  assert.equal(govSize(0.63, 'RC 200').model, 'LK200');
  assert.equal(govSize(1, 'RC 300').model, 'LK200');
  assert.equal(govSize(2, 'RC 200').model, 'RC 200');
  assert.equal(govSize(0.1, 'NOR').model, 'LK200');
  const rc = GOVERNORS.find((g) => g.model === 'RC 200');
  assert.ok(rc && !takesSpeed(rc, 1.59) && takesSpeed(rc, 1.6) && takesSpeed(rc, 4.2));
  // the series by the speed has no lower bound
  assert.ok(GOVERNORS.slice(0, 4).every((g) => g.vMin === 0));
  // UNI EN 81-20:2020, 5.6.2.2.1.1 a): from 1,15·v, below the gear's limit
  const w = (v: number, g: 'instantaneous' | 'roller' | 'progressive') => { const x = tripWindow(v, g); return [Number(x.lo.toFixed(5)), Number(x.hi.toFixed(5))]; };
  assert.deepEqual(w(0.63, 'instantaneous'), [0.7245, KV_VERT.govTripInstant]);
  assert.deepEqual(w(0.5, 'roller'), [0.575, KV_VERT.govTripRoller]);
  assert.deepEqual(w(1, 'progressive'), [1.15, KV_VERT.govTripProgressive]);
  assert.deepEqual(w(1.6, 'progressive'), [1.84, 2.15625]);
  // rounded inward; none where the gear does not take the speed
  assert.equal(tripText(0.63, { safetyGear: 'instantaneous' }), '≥ 0,73 e < 0,80');
  assert.equal(tripText(1.6, {}), '≥ 1,84 e < 2,15');
  assert.equal(tripRange(1, { safetyGear: 'instantaneous' }), null);
  // sheet 1 next to the governor; the bill; the relazione
  const s = sheet('head', { safetyGear: 'progressive' }, 1.6);
  const rows = s.specs.map((r) => r.join(' | '));
  const at = rows.findIndex((r) => r.startsWith('LIMITATORE DI VELOCITÀ'));
  assert.equal(rows[at + 1], 'VELOCITÀ D’INTERVENTO DA TARARE | m/s | ≥ 1,84 e < 2,15');
  const L = newLift(), bom = designBom(deriveLift(L), { safetyGear: 'instantaneous' }).find((b) => (b.key ?? '').startsWith('governor:'));
  assert.deepEqual(bom?.label, { item: 'governor_trip', name: 'PFB LK200', args: { lo: '0,73', hi: '0,80' } });
  assert.ok(relazione(L, { safetyGear: 'instantaneous' }).includes('velocità d’intervento da tarare ≥ 0,73 e < 0,80 m/s'));
  // the registry gives the whole clause, not only the 115 %
  assert.match(voce('ingombri.limitatore').riferimento, /5\.6\.2\.2\.1\.1 a\) 1\)–4\)/);
  assert.match(voce('limitatore.scatto').riferimento, /5\.6\.2\.2\.1\.1 a\) 1\)–4\)/);
});

test('fune del limitatore: coefficiente ≥ 8 e forza all’intervento, dati dei fornitori da verificare, nella relazione', () => {
  const f = voce('limitatore.fune');
  assert.match(f.riferimento, /5\.6\.2\.2\.1\.3 b\)/);
  assert.match(f.riferimento, /5\.6\.2\.2\.1\.1 d\)/);
  assert.match(f.valore, /almeno 8 volte/);
  assert.match(voce('modello.non.calcolate').valore, /fune del limitatore \(carico minimo di rottura almeno 8 volte/);
});

test('guide del contrappeso alla presa del suo paracadute: carico di punta e forze di guida (gr_cw)', () => {
  // the example under the pit at 1 m/s: T45/A, 960 kg, brackets every 1856 mm — σk 365 N/mm² with an instantaneous gear
  const L = withV(under(newLift()), 1), d = deriveLift(L), Mcw = d.analysis.res.Mcw;
  near(Mcw, 960, 1, 'Mcw');
  const inst = cwRailCheck(d.layout, Mcw, 'instantaneous', {});
  near(inst.l, 1856, 1, 'l');
  near(inst.lambda, 195, 0.5, 'λ');
  assert.ok(inst.sk !== null && inst.sc !== null);
  near(inst.sk, 365.2, 0.2, 'σk');
  assert.equal(inst.sc, inst.sk + KV_VERT.railCombine * inst.sm);
  assert.equal(cwRailChecks(inst)[0]?.status, 'fail');
  // a progressive gear (k1 2) holds on T45/A; a T70-1/A holds an instantaneous one
  assert.equal(cwRailChecks(cwRailCheck(d.layout, Mcw, 'progressive', {}))[0]?.status, 'ok');
  const big = deriveLift({ ...L, shaft: { ...L.shaft, cwRail: 'T70-1/A' } });
  assert.equal(cwRailChecks(cwRailCheck(big.layout, big.analysis.res.Mcw, 'instantaneous', {}))[0]?.status, 'ok');
  // on sheet 1 only with a space under the shaft, with the gear of the data of the installation
  const label = /^Guide del contrappeso alla presa/;
  const gr = (s: ReturnType<typeof sheet>) => s.checks.find((r) => label.test(r[0]));
  assert.equal(gr(sheet('under', { cwSafetyGear: 'instantaneous', cwGearTrip: 'rupture' }))?.[3], 'NON PASSA');
  assert.equal(gr(sheet('under', { cwSafetyGear: 'progressive', cwGearTrip: 'governor' }, 1, 'T70-1/A'))?.[3], 'OK');
  assert.equal(gr(sheet('under', { cwSafetyGear: 'pillar' })), undefined);
  assert.equal(gr(sheet('head', { cwSafetyGear: 'instantaneous' })), undefined);
  // the relazione gives the numbers; the registry has the check and its numbers
  assert.ok(relazione(L, { cwSafetyGear: 'instantaneous', cwGearTrip: 'rupture' }).includes('Guide del contrappeso T45/A, paracadute istantaneo (k1 5)'));
  assert.deepEqual(voce('guide.contrappeso').verifiche, ['gr_cw']);
  assert.match(voce('modello.non.calcolate').valore, /le guide del contrappeso alla presa del suo paracadute, a carico di punta e con le forze di guida/);
});
