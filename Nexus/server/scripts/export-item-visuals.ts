/**
 * Каталог за 3D иконите/прегледа — `npx tsx scripts/export-item-visuals.ts`
 * (от Nexus/server). Чете сийд данните (ITEM_SEED + ITEM_SETS) и записва
 * Nexus/client/public/assets/items3d/catalog.json: масив с ВСЕКИ екипируем
 * предмет (weapon, shield, helm, armor, gloves, boots, cloak, ring, amulet).
 *
 * Договор (3D агентът чете точно този файл):
 *   { slug, name, category, sub_type, tier, rarity, class_req, set_slug|null, theme }
 *   theme = темата на сета (seed/sets.ts), иначе TIER_THEMES[tier].
 * Адитивни полета: `icon` (реалната форма — dagger/mace/spear при
 * sub_type sword/axe/bow) и `level_req`.
 *
 * set_slug = сетът, чиято УНИКАЛНА част е предметът. Legacy частите (старите
 * общи leather/chain/plate…, които още се броят за сет) НЕ носят set_slug —
 * визуално са общи предмети на тира си.
 *
 * Детерминистично: без БД. Предметите, които маршрутите създават при първо
 * ползване (сезонни трофеи, realm boss, Tower of Trials), идват от
 * seed/runtimeItems.ts — същите редове, които маршрутите вписват (без
 * ръчно копие → без дрейф на тир/ниво).
 */
/* eslint-disable no-console */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ITEM_SEED } from '../src/seed/items';
import { ITEM_SETS, TIER_THEMES, type SetTheme } from '../src/seed/sets';
import { RUNTIME_ITEM_SEED } from '../src/seed/runtimeItems';

const EQUIP = ['weapon', 'shield', 'helm', 'armor', 'gloves', 'boots', 'cloak', 'ring', 'amulet'] as const;
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, '..', 'client', 'public', 'assets', 'items3d', 'catalog.json');

interface Row {
  slug: string; name: string; category: string; sub_type: string; tier: number; rarity: string;
  class_req: string; set_slug: string | null; theme: SetTheme; icon: string; level_req: number;
}

function main(): void {
  const setOf = new Map<string, (typeof ITEM_SETS)[number]>();
  for (const s of ITEM_SETS) for (const p of s.pieces) {
    if (setOf.has(p)) throw new Error(`предмет ${p} е уникална част на два сета`);
    setOf.set(p, s);
  }
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const it of ITEM_SEED as any[]) {
    if (!(EQUIP as readonly string[]).includes(it.category)) continue;
    const set = setOf.get(it.slug);
    rows.push({
      slug: it.slug, name: it.name, category: it.category, sub_type: it.sub_type || '',
      tier: it.tier, rarity: it.rarity, class_req: it.class_req || '',
      set_slug: set ? set.slug : null,
      theme: set ? set.theme : TIER_THEMES[it.tier],
      icon: it.icon || it.category, level_req: it.level_req,
    });
    seen.add(it.slug);
  }
  for (const r of RUNTIME_ITEM_SEED) {
    if (!(EQUIP as readonly string[]).includes(r.category)) continue;
    if (seen.has(r.slug)) throw new Error(`${r.slug} е и в ITEM_SEED, и в RUNTIME_ITEM_SEED`);
    rows.push({
      slug: r.slug, name: r.name, category: r.category, sub_type: r.sub_type, tier: r.tier, rarity: r.rarity,
      class_req: r.class_req, set_slug: null, theme: TIER_THEMES[r.tier],
      icon: r.icon || r.category, level_req: r.level_req,
    });
  }
  for (const r of rows) if (!r.theme) throw new Error(`${r.slug}: няма тема (tier ${r.tier})`);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  const bySet = rows.filter((r) => r.set_slug).length;
  console.log(`catalog.json: ${rows.length} предмета (${bySet} части от сет, ${rows.length - bySet} с тема по тир) → ${OUT}`);
}

main();
