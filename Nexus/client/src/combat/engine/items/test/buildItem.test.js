// Проверява генератора без GPU (три.js геометрия е чиста математика): детерминизъм по slug,
// всеки слот/тип оръжие строи без грешка, dispose() чисти без изключения.
// Пуска се с `node --import tsx --test` (buildItem.ts внася .ts модули — tsx транспилира налету).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItem } from '../buildItem.ts';
import { fallbackTheme } from '../theme.ts';

function entry(overrides) {
  const base = { slug: 'test_item', name: 'Test Item', category: 'weapon', sub_type: 'sword', tier: 3, rarity: 'rare', ...overrides };
  return { ...base, theme: fallbackTheme(base) };
}

function centroid(obj) {
  let sum = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) sum += pos.getX(i) + pos.getY(i) * 2 + pos.getZ(i) * 3;
  });
  return sum;
}

test('buildItem е детерминистичен по slug (същият slug -> идентична геометрия)', () => {
  const e = entry({ slug: 'flameblade' });
  const a = buildItem(e);
  const b = buildItem(e);
  assert.equal(centroid(a.object), centroid(b.object));
  a.dispose();
  b.dispose();
});

test('различни slug-ове дават различна геометрия/тема (не константен изход)', () => {
  const a = buildItem(entry({ slug: 'slug_one' }));
  const b = buildItem(entry({ slug: 'slug_two' }));
  assert.notEqual(centroid(a.object), centroid(b.object));
  a.dispose();
  b.dispose();
});

const CATEGORIES = ['weapon', 'shield', 'helm', 'armor', 'gloves', 'boots', 'cloak', 'ring', 'amulet'];
const SUB_TYPES = ['sword', 'axe', 'mace', 'dagger', 'bow', 'staff', 'spear'];

test('всеки слот строи без грешка, при всички тирове', () => {
  for (const category of CATEGORIES) {
    for (const tier of [1, 4, 8, 12]) {
      const e = entry({ slug: `${category}_t${tier}`, category, tier });
      const built = buildItem(e);
      assert.ok(built.object.children.length > 0, `${category} T${tier} произведе празен обект`);
      built.dispose();
    }
  }
});

test('всеки тип оръжие строи без грешка', () => {
  for (const sub_type of SUB_TYPES) {
    const e = entry({ slug: `weapon_${sub_type}`, category: 'weapon', sub_type });
    const built = buildItem(e);
    assert.ok(built.object.children.length > 0, `${sub_type} произведе празен обект`);
    built.dispose();
  }
});

test('rarity halo се появява само за epic/legendary', () => {
  const common = buildItem(entry({ slug: 'common_ring', category: 'ring', rarity: 'common' }));
  const legendary = buildItem(entry({ slug: 'legendary_ring', category: 'ring', rarity: 'legendary' }));
  assert.ok(legendary.object.children.length >= common.object.children.length);
  common.dispose();
  legendary.dispose();
});

test('dispose() не хвърля при повторно извикване', () => {
  const built = buildItem(entry({ slug: 'dispose_twice' }));
  built.dispose();
  assert.doesNotThrow(() => built.dispose());
});
