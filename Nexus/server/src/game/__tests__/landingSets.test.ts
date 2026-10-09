import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ITEM_SETS } from '../../seed/sets';

/**
 * Лендингът (client/src/pages/Landing.tsx) показва бонусите на 8 витринни сета като текст.
 * Те се бяха разминали със сийда след преработката на класовите сетове (6 от 8 грешни) —
 * този тест чете Landing.tsx и сверява всеки ред „2/4/6 части“ с ITEM_SETS.
 */
const LABEL: Record<string, (n: number) => string> = {
  hp_bonus: (n) => `+${n} HP`,
  mp_bonus: (n) => `+${n} MP`,
  defense_bonus: (n) => `+${n} DEF`,
  atk_bonus: (n) => `+${n} ATK`,
  str_bonus: (n) => `+${n} STR`,
  dex_bonus: (n) => `+${n} DEX`,
  int_bonus: (n) => `+${n} INT`,
  wis_bonus: (n) => `+${n} WIS`,
  crit_bonus: (n) => `+${Math.round(n * 100)}% Crit`,
  dodge_bonus: (n) => `+${Math.round(n * 100)}% Dodge`,
};

function expected(bonus: Record<string, number> | undefined): string[] {
  return Object.entries(bonus || {}).map(([k, v]) => {
    const f = LABEL[k];
    assert.ok(f, `непознат бонус ${k} — добави го в LABEL`);
    return f(v);
  }).sort();
}

test('бонусите на сетовете в лендинга съвпадат със seed/sets.ts', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../../client/src/pages/Landing.tsx'), 'utf8');
  const cards = [...src.matchAll(/<SetCard[^>]*name="([^"]+)"[^>]*bonuses=\{(\[\[.*?\]\])\}/g)];
  assert.ok(cards.length >= 8, `намерени ${cards.length} SetCard-а`);
  for (const [, name, raw] of cards) {
    const set = ITEM_SETS.find((s) => s.name === name);
    assert.ok(set, `сетът „${name}“ от лендинга не съществува в ITEM_SETS`);
    const rows = JSON.parse(raw.replace(/'/g, '"')) as [string, string][];
    const want: [string, string[]][] = [['2', expected(set!.bonus_2)], ['4', expected(set!.bonus_4)]];
    if (set!.bonus_6) want.push(['6', expected(set!.bonus_6)]);
    assert.deepEqual(rows.map(([n]) => n), want.map(([n]) => n), `${name}: редове с бонуси`);
    for (const [n, text] of rows) {
      const got = text.split(',').map((x) => x.trim()).sort();
      assert.deepEqual(got, want.find(([m]) => m === n)![1], `${name}: бонус за ${n} части`);
    }
  }
});
