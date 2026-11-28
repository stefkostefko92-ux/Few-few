// Релефът на Обзор (v1.19): местата на хъбовете не излизат от картата и не се
// застъпват — на трите езика и на най-тесния телефон, с число в пръстена.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, layoutPins, heightAt } from '../public/topo.js';
import { HUBS } from '../public/nav.js';
import { ENTRIES } from '../public/i18n-dict.js';

const TR = new Map(ENTRIES.map(([bg, en, it]) => [bg, { en, it }]));
// Груба, но песимистична оценка на ширината: 12.5px Golos ≈ 7.2px на знак +
// маркер, отстъпи, рамка + място за число „12".
const widthOf = (label) => Math.ceil(label.length * 7.2) + 44 + 18;
const PIN_H = 34;

for (const lang of ['bg', 'en', 'it']) {
  for (const [W, H] of [[290, 230], [700, 300], [1500, 300]]) {
    test(`местата: ${lang} · ${W}×${H} — вътре в картата и без застъпване`, () => {
      const label = (h) => (lang === 'bg' ? h.label : TR.get(h.label)?.[lang]);
      const widths = Object.fromEntries(HUBS.map((h) => [h.id, widthOf(label(h))]));
      for (const h of HUBS) assert.ok(label(h), `няма превод на „${h.label}" (${lang})`);
      const xs = layoutPins(widths, W);
      for (const h of HUBS) {
        assert.ok(xs[h.id] - widths[h.id] / 2 >= 0 && xs[h.id] + widths[h.id] / 2 <= W, `„${label(h)}" излиза от картата`);
      }
      const ids = HUBS.map((h) => h.id);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = [ids[i], ids[j]];
          const dy = Math.abs(PLACES[a][1] - PLACES[b][1]) * H;
          const dx = Math.abs(xs[a] - xs[b]);
          const overlap = dy < PIN_H && dx < (widths[a] + widths[b]) / 2;
          assert.ok(!overlap, `„${label(HUBS[i])}" и „${label(HUBS[j])}" се застъпват (dx ${dx.toFixed(0)}, dy ${dy.toFixed(0)})`);
        }
      }
    });
  }
}

test('всеки хъб има място на картата', () => {
  assert.deepEqual(Object.keys(PLACES).sort(), HUBS.map((h) => h.id).sort());
});

test('релефът: тревогата вдига мястото си, натоварването — всички; функцията е детерминистична', () => {
  const [px, py] = PLACES.data;
  const d = (py - 0.12) / 0.84;
  const calm = heightAt(px, d, { load: 0 }).h;
  const hot = heightAt(px, d, { load: 0, states: { data: { sev: 'danger', n: 1 } } });
  assert.ok(hot.h > calm * 1.3, 'критичната аларма не вдига мястото си');
  assert.equal(hot.top, 'data');
  assert.ok(heightAt(px, d, { load: 1 }).h > calm, 'натоварването не вдига релефа');
  assert.equal(heightAt(0.3, 0.4, { t: 2 }).h, heightAt(0.3, 0.4, { t: 2 }).h);
});
