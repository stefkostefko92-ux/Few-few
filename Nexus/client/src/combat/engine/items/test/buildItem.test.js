// Проверява адаптера (boy геометрия/материя, тонирана по тема) без GPU рендер: детерминизъм по
// slug, всеки standalone/mannequin слот строи без грешка, dispose() чисти без изключения, а
// previewMode() класифицира вярно 'standalone' | 'mannequin' | 'icon' (виж support.ts — решетката
// вече е изцяло стара JPG, 3D живее само в прегледа: самостоятелен предмет / рицарски манекен /
// голяма стара икона, когато boy няма геометрия).
// Пуска се с `node --import tsx --test` (buildItem.ts внася .ts модули — tsx транспилира налету).
// heraldry.js/motifTexture.ts рисуват в <canvas> (DOM) — тук няма jsdom, затова boy-materials.ts
// и buildItem.ts пропускат декали/хералдика извън браузър; геометрията не зависи от тези пиксели.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItem } from '../buildItem.ts';
import { buildMannequin, buildDressedKnight } from '../mannequin.ts';
import { fallbackTheme } from '../theme.ts';
import { previewMode, supports3DIcon, DIAGONAL_WEAPON_ICONS } from '../support.ts';

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

const STANDALONE_CATEGORIES = ['weapon', 'shield', 'helm', 'gloves'];
const MANNEQUIN_CATEGORIES = ['armor', 'boots', 'cloak'];
const ICON_CATEGORIES = ['ring', 'amulet'];

test('previewMode класифицира вярно всеки слот', () => {
  for (const category of STANDALONE_CATEGORIES) {
    assert.equal(previewMode(entry({ slug: `${category}_pm`, category })), 'standalone', category);
  }
  for (const category of MANNEQUIN_CATEGORIES) {
    assert.equal(previewMode(entry({ slug: `${category}_pm`, category })), 'mannequin', category);
  }
  for (const category of ICON_CATEGORIES) {
    assert.equal(previewMode(entry({ slug: `${category}_pm`, category })), 'icon', category);
  }
  for (const icon of DIAGONAL_WEAPON_ICONS) {
    assert.equal(previewMode(entry({ slug: `weapon_${icon}`, category: 'weapon', sub_type: icon, icon })), 'standalone', icon);
  }
  for (const icon of ['axe', 'spear']) {
    assert.equal(previewMode(entry({ slug: `weapon_${icon}`, category: 'weapon', sub_type: icon, icon })), 'icon', icon);
  }
});

test('previewMode праща качулка/маска/корона/диадема на стара икона, не метален шлем', () => {
  const hoodNames = ['Cloth Hood', 'Nightveil Cowl', 'Trial Crown', 'Cutpurse Mask', 'Archon’s Circlet', 'Mythwoven Diadem'];
  for (const name of hoodNames) {
    const e = entry({ slug: `hoodtest_${name}`, category: 'helm', name });
    assert.equal(previewMode(e), 'icon', name);
  }
  const realHelm = entry({ slug: 'real_plate_helm', category: 'helm', name: 'Plate Greathelm' });
  assert.equal(previewMode(realHelm), 'standalone');
});

test('buildItem е детерминистичен по slug (същият slug -> идентична геометрия)', async () => {
  const e = entry({ slug: 'flameblade' });
  const a = await buildItem(e);
  const b = await buildItem(e);
  assert.equal(centroid(a.object), centroid(b.object));
  a.dispose();
  b.dispose();
});

test('различни slug-ове дават различна геометрия (не константен изход)', async () => {
  const a = await buildItem(entry({ slug: 'slug_one', category: 'helm' }));
  const b = await buildItem(entry({ slug: 'slug_two', category: 'helm' }));
  assert.notEqual(centroid(a.object), centroid(b.object));
  a.dispose();
  b.dispose();
});

test('всеки standalone слот строи без грешка, при всички тирове', async () => {
  for (const category of STANDALONE_CATEGORIES) {
    for (const tier of [1, 4, 8, 12]) {
      const e = entry({ slug: `${category}_t${tier}`, category, tier });
      const built = await buildItem(e);
      assert.ok(built, `${category} T${tier} върна null, а previewMode го маркира standalone`);
      assert.ok(built.object.children.length > 0, `${category} T${tier} произведе празен обект`);
      built.dispose();
    }
  }
});

test('всеки биещ тип оръжие (icon) строи без грешка', async () => {
  for (const icon of DIAGONAL_WEAPON_ICONS) {
    const e = entry({ slug: `weapon_${icon}`, category: 'weapon', sub_type: icon, icon });
    const built = await buildItem(e);
    assert.ok(built, `${icon} върна null`);
    assert.ok(built.object.children.length > 0, `${icon} произведе празен обект`);
    built.dispose();
  }
});

test('buildItem връща null за mannequin/icon категории (не негов режим)', async () => {
  for (const category of [...MANNEQUIN_CATEGORIES, ...ICON_CATEGORIES]) {
    const e = entry({ slug: `${category}_none`, category });
    const built = await buildItem(e);
    assert.equal(built, null, `${category} трябваше да върне null от buildItem`);
  }
});

test('оръжия без боен силует в boy (брадва/копие) са icon режим', () => {
  for (const icon of ['axe', 'spear']) {
    const e = entry({ slug: `weapon_${icon}_none`, category: 'weapon', sub_type: icon, icon });
    assert.equal(supports3DIcon(e), false, `${icon} трябваше да е icon режим`);
  }
});

test('dispose() не хвърля при повторно извикване', async () => {
  const built = await buildItem(entry({ slug: 'dispose_twice', category: 'helm' }));
  built.dispose();
  assert.doesNotThrow(() => built.dispose());
});

test('buildMannequin строи манекен (armor/boots/cloak) без грешка и dispose чисти', async () => {
  for (const category of MANNEQUIN_CATEGORIES) {
    const e = entry({ slug: `mannequin_${category}`, category });
    const built = await buildMannequin(e, () => 0.3);
    assert.ok(built.object.children.length > 0, `${category} манекен произведе празен обект`);
    built.dispose();
    assert.doesNotThrow(() => built.dispose());
  }
});

test('buildDressedKnight облича цял сет (всички слотове наведнъж) без грешка', async () => {
  const pieces = [
    entry({ slug: 'set_helm', category: 'helm', name: 'Set Helm' }),
    entry({ slug: 'set_armor', category: 'armor' }),
    entry({ slug: 'set_gloves', category: 'gloves' }),
    entry({ slug: 'set_boots', category: 'boots' }),
    entry({ slug: 'set_shield', category: 'shield' }),
    entry({ slug: 'set_weapon', category: 'weapon', sub_type: 'sword', icon: 'sword' }),
    entry({ slug: 'set_cloak', category: 'cloak' }),
  ];
  const built = await buildDressedKnight(pieces);
  assert.ok(built.object.children.length > 10, 'облеченият рицар изглежда празен/непълен');
  built.dispose();
  assert.doesNotThrow(() => built.dispose());
});

test('buildDressedKnight пропуска липсващи слотове грациозно (частичен сет)', async () => {
  const pieces = [
    entry({ slug: 'partial_helm', category: 'helm', name: 'Partial Helm' }),
    entry({ slug: 'partial_boots', category: 'boots' }),
  ];
  const built = await buildDressedKnight(pieces);
  assert.ok(built.object.children.length > 0);
  built.dispose();
});
