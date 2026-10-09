// A side counterweight's bridge in every document (round 37, G correction): NOTA 1 of sheet 1 says that only the car
// rail anchored to a wall brings its thrusts to the wall, as the rails' sheet does; the relazione counts the brackets
// of each car rail as sheet 1 does — the rail on the bridge at the bridge's heights, at the closer of the two pitches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { SHAFT_ENGINE_VERSION, defaultInputs, type ShaftInputs } from '@/shaft';
import { withPitches } from '@/shaft/brackets';
import { bridgeHeights, onBridge, railHeights, railSide, wallCarRail } from '@/shaft/rail-brackets';
import type { Layout } from '@/shaft/types';
import { deriveLift, newLift } from '../lift';
import { valueMarks } from '../lift/marks';
import type { Plant } from '../plant';
import { buildReport } from '../report/build';
import { setSheets } from '../tavole/build';
import { storedInput } from '../tavole/compose';
import { shaftDetailText } from '../tavole/notes-vano';

const design = (shaft: Partial<ShaftInputs>): Layout => deriveLift({ ...newLift(), shaft: { ...defaultInputs(1600, 1750), ...shaft } }).layout;

test('nota 1 del foglio 1: con il contrappeso laterale la guida sul ponte non porta alla parete', () => {
  const X = { cwGap: null, fx: '31', fy: '41' };
  for (const cw of ['left', 'right'] as const) {
    const L = design({ cw }), on = L.rails.find((r) => onBridge(L, r)), wall = wallCarRail(L), text = shaftDetailText(L, X);
    assert.ok(on && wall && wall !== on, cw);
    assert.ok(!text.includes('Ogni staffa delle guide di cabina porta alla parete'), `${cw}: ${text}`);
    assert.ok(text.includes(`Ogni staffa della guida di cabina ${railSide(L, wall)} porta alla parete fino a Fx 31 e Fy 41 daN`), `${cw}: ${text}`);
    assert.ok(text.includes(`la guida ${railSide(L, on)} è sulla staffa a ponte: le sue spinte vanno al ponte e alle staffe del contrappeso`), `${cw}: ${text}`);
  }
  // without a bridge both car rails are anchored to the walls, as before
  assert.ok(shaftDetailText(design({ cw: 'rear' }), X).includes('Ogni staffa delle guide di cabina porta alla parete fino a Fx 31 e Fy 41 daN'));
});

test('relazione e foglio 1: le staffe di ogni guida di cabina, quella sul ponte al passo più fitto (2500/1000 dei dati dell’impianto)', () => {
  const plant: Plant = { carBracketPitch: 2500, cwBracketPitch: 1000 };
  for (const cw of ['left', 'rear'] as const) {
    const shaft = { ...defaultInputs(1600, 1750), cw }, L0 = { ...newLift(), shaft }, d = deriveLift(L0), L = d.layout;
    const doc = buildReport({
      calc: { id: 'cmtest0001', label: 'offerta', createdAt: new Date('2026-09-30T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: 'M' },
      project: { name: 'Prova', address: null, city: null, province: null, plantNumber: null, client: null }, company: 'Ditta', values: PRESETS.A,
      generatedAt: new Date('2026-09-30T09:00:00Z'), reviews: [], plant,
      design: { id: 'cmdesign01', label: 'r', createdAt: new Date('2026-09-29T16:00:00Z'), sha256: 'e'.repeat(64), engineVersion: SHAFT_ENGINE_VERSION, profileId: 'IT-2026.1', author: 'M', layout: L, source: null },
    });
    const rails = doc.blocks.find((b) => b.t === 'p' && b.text.startsWith('Guide di cabina'));
    assert.ok(rails && rails.t === 'p', cw);
    const x = storedInput(d.values, L, { number: '1', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M', companyName: 'S',
      projectData: { name: 'P', address: null, city: null, province: null, plantNumber: null, client: null }, plant, revisions: [] }, null, valueMarks(L0.auto, d, d.bottom, d.collaudo));
    assert.ok(x);
    const row = setSheets(x).ds.sheet.specs.find((r) => r[0] === 'STAFFE GUIDE DI CABINA')?.[2], Lp = withPitches(L, { car: plant.carBracketPitch, cw: plant.cwBracketPitch });
    const wall = wallCarRail(Lp);
    assert.ok(wall);
    const n = railHeights(Lp, wall).length, m = bridgeHeights(Lp).length;
    if (cw === 'left') {
      // the relazione and sheet 1 give the same counts: the rail on the bridge more often than the one on the wall
      assert.ok(m > n, `${m} > ${n}`);
      assert.ok(rails.text.includes(`(${n} staffe sulla guida a parete, ${m} sulla staffa a ponte al passo più fitto tra cabina e contrappeso`), rails.text);
      assert.ok(!rails.text.includes('staffe per guida'), rails.text);
      assert.equal(row, `${n + m} (${m} SULLA STAFFA A PONTE)`);
    } else {
      assert.equal(m, 0);
      assert.ok(rails.text.includes(`(${n} staffe per guida, passo dei dati dell’impianto 2500 mm)`), rails.text);
      assert.equal(row, `${2 * n}`);
    }
  }
});
