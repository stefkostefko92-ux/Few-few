// Section A-A whole with many floors (round 37): the travel drawn shorter never brings two floors closer on paper than
// their numbers and the figures of their rises need — where it would, the floors of the shortened travel are left out
// but its first and last that read, the rises over them summed in one dimension ("Piani …") and each floor left out
// given in a table on the sheet (its height over the lowest floor and its rise), the scale kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultInputs, layout, section, type ShaftInputs } from '@/shaft';
import { sectionDims } from '@/shaft/section-dims';
import { FLOOR_GAP } from '../tavole/views';
import { overlapping, sheetsBy, shaftSheets, textsOf } from './sheets-helpers';

const D = defaultInputs(1600, 1750);
const withFloors = (n: number, rise: (i: number) => number): ShaftInputs => ({
  ...D, vertical: { ...D.vertical, main: Math.floor(n / 2), floors: Array.from({ length: n }, (_, i) => ({ label: String(i), rise: i === n - 1 ? 0 : rise(i), door: 'A' as const })) },
});
const mixed = (i: number): number => 2500 + ((i * 731) % 2000);

for (const n of [2, 5, 7, 9, 10, 12, 15, 19, 25]) {
  test(`sezione A-A intera con ${n} fermate: numeri dei piani e interpiani leggibili, i piani tolti nella tabella`, () => {
    const I = withFloors(n, mixed), r = shaftSheets(I), [aa] = sheetsBy(r, /^VISTA IN ELEVATO - SEZ\. A-A$/);
    assert.ok(aa, `${n}: foglio A-A`);
    const T = textsOf(aa.shapes), labels = new Set(I.vertical.floors.map((f) => f.label));
    // the floors' numbers (3 mm) and the rises' lettering never over each other nor over another value
    const floorish = (s: string): boolean => (labels.has(s) && T.some((t) => t.text === s && t.size === 3)) || /^(Interpiano |Piani ")/.test(s) || /^\d+$/.test(s);
    assert.deepEqual(overlapping(T, (a, b) => floorish(a) && floorish(b)), [], `${n} fermate`);
    // every floor is drawn or in the table
    const drawn = I.vertical.floors.filter((f) => T.some((t) => t.text === f.label && t.size === 3)).map((f) => f.label);
    const rows = T.filter((t) => /^"[^"]+"$/.test(t.text)).map((t) => t.text.slice(1, -1));
    for (const f of I.vertical.floors) assert.ok(drawn.includes(f.label) || rows.includes(f.label), `${n}: piano ${f.label}`);
    // (from 10 floors on this shaft the shortened travel brings them too close: the table)
    assert.equal(rows.length > 0, n >= 10, `${n}: tabella dei piani tolti`);
    if (!rows.length) {
      assert.ok(!T.some((t) => t.text === 'QUOTE DEI PIANI'), `${n}: nessuna tabella senza piani tolti`);
      return;
    }
    // the table: each floor left out with the one drawn over them, its height and its rise; the rises sum to the
    // dimension over them
    assert.ok(T.some((t) => t.text === 'QUOTE DEI PIANI') && rows.length >= 2, `${n}: tabella`);
    const S = section(layout(I)), lv = (label: string): number => S.levels[I.vertical.floors.findIndex((f) => f.label === label)] ?? NaN;
    for (const row of rows) assert.ok(T.some((t) => t.text === `+${Math.round(lv(row))}`), `${n}: quota del piano ${row}`);
    const piani = T.find((t) => /^Piani "/.test(t.text));
    assert.ok(piani, `${n}: quota dei piani tolti`);
    const [, a, b, v] = /^Piani "([^"]+)"–"([^"]+)" (\d+)$/.exec(piani.text) ?? [];
    assert.equal(Number(v), Math.round(lv(b ?? '') - lv(a ?? '')), `${n}: somma`);
    assert.deepEqual(rows, I.vertical.floors.slice(I.vertical.floors.findIndex((f) => f.label === a) + 1, I.vertical.floors.findIndex((f) => f.label === b) + 1).map((f) => f.label));
    assert.equal(r.sheets.find((s) => s.title === 'VISTA IN ELEVATO - SEZ. A-A')?.scale, 50, `${n}: la scala resta`);
  });
}

test('sezione A-A intera: la quota dei piani tolti non si modifica, gli interpiani disegnati sì', () => {
  const I = withFloors(19, mixed), L = layout(I), S = section(L), omit = [3, 4, 5];
  const rows = sectionDims(L, S, 'full', 18, { z0: 2500, z1: S.top - 2000, f: 0.1 }, omit).flatMap((e) => (e.e === 'chain' && e.c.text?.[0] === 'Interpiano 2500' ? [e.c] : []));
  const c = rows[0];
  assert.ok(c);
  const at = c.text?.findIndex((t) => t?.startsWith('Piani "2"–"6"')) ?? -1;
  assert.ok(at >= 0 && c.edit?.[at] === null, 'somma dei piani tolti: nessuna modifica');
  assert.ok(c.edit?.every((e, i) => i === at || e?.key === `f.${[0, 1, 2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17][i] ?? -1}.rise`), 'interpiani dei piani disegnati');
  assert.ok(FLOOR_GAP >= 3 + 1, 'numero del piano (3 mm) e 1 mm');
});
