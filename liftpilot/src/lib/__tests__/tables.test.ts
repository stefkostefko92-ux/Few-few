// The traction table of the technical tables (src/lib/present/tables.ts) and the report's own (report/build.ts): the
// two stalled cases name the right part. Swapping "car" and "counterweight" changes no figure, so no golden catches it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import calcIt from '../../../messages/calc/it.json';
import calcEn from '../../../messages/calc/en.json';
import calcBg from '../../../messages/calc/bg.json';
import { PRESETS } from '@/calc/presets';
import { analyse } from '../present/analysis';
import { techTables, type Cell } from '../present/tables';
import { textsFor } from '../present/texts';
import { makePres, type CalcDict } from '../present/tr';
import { buildReport } from '../report/build';

const cell = (c: Cell | undefined): { text: string; sub?: string } => (typeof c === 'string' ? { text: c } : { text: c?.text ?? '', ...(c?.sub ? { sub: c.sub } : {}) });

test('i due casi di aderenza bloccata: in alto il contrappeso, in basso la cabina (it)', () => {
  const P = makePres(calcIt as CalcDict, 'it-IT'), a = analyse(PRESETS.C);
  assert.equal(a.res.stall.pos, 't', 'il caso in alto è quello della simulazione');
  assert.equal(a.res.stallLow.pos, 'b');
  const trac = techTables(P, textsFor(P), a).find((tb) => tb.key === 'trac');
  assert.ok(trac);
  const [top, low] = trac.rows.slice(-2).map((r) => cell(r[0]));
  assert.equal(top?.text, 'Contrappeso sugli ammortizzatori');
  assert.match(top?.sub ?? '', /in alto$/);
  assert.equal(low?.text, 'Cabina sugli ammortizzatori');
  assert.match(low?.sub ?? '', /in basso$/);
});

test('lo stesso in inglese e in bulgaro', () => {
  for (const [dict, loc, cw, car] of [
    [calcEn, 'en-GB', 'Counterweight on its buffers', 'Car on its buffers'],
    [calcBg, 'bg-BG', 'Противотежестта на буферите', 'Кабината на буферите'],
  ] as const) {
    const P = makePres(dict as CalcDict, loc), trac = techTables(P, textsFor(P), analyse(PRESETS.C)).find((tb) => tb.key === 'trac');
    assert.deepEqual(trac?.rows.slice(-2).map((r) => cell(r[0]).text), [cw, car], loc);
  }
});

test('la relazione ha le stesse etichette: contrappeso in alto, cabina in basso', () => {
  const doc = buildReport({
    calc: { id: 'cmtest0001', label: null, createdAt: new Date('2026-10-05T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project: { name: 'Impianto di prova', address: null, city: null, province: null, plantNumber: null, client: null },
    company: 'Ditta di prova', values: PRESETS.C, generatedAt: new Date('2026-10-05T09:00:00Z'), reviews: [],
  });
  const grid = doc.blocks.find((b) => b.t === 'grid' && b.head[8] === 'Condizione');
  assert.ok(grid && grid.t === 'grid');
  assert.equal(grid.rows.length, 2);
  assert.match(grid.rows[0]?.[0] ?? '', /^Contrappeso sugli ammortizzatori: .*in alto$/);
  assert.match(grid.rows[1]?.[0] ?? '', /^Cabina sugli ammortizzatori: .*in basso$/);
});
