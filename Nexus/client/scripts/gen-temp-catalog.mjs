#!/usr/bin/env node
// ВРЕМЕНЕН каталог — вижте договора в задачата „нарисувай предметите на Nexus Dominion в 3D“.
// Чете реалните seed данни (server/src/seed/items.ts + sets.ts) и им лепи fallbackTheme() по
// тир, ДОКАТО финалният client/public/assets/items3d/catalog.json от агента за данни не дойде
// (същата схема — { slug, name, category, sub_type, tier, rarity, class_req, set_slug, theme }).
// Не е финален — при качване на истинския каталог просто се презаписва и bake се пуска пак.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ITEM_SEED } from '../../server/src/seed/items.ts';
import { ITEM_SETS } from '../../server/src/seed/sets.ts';
import { fallbackTheme } from '../src/combat/engine/items/theme.ts';

const EQUIP_CATEGORIES = new Set(['weapon', 'shield', 'helm', 'armor', 'gloves', 'boots', 'cloak', 'ring', 'amulet']);

const setBySlug = new Map();
for (const set of ITEM_SETS) {
  for (const piece of set.pieces) setBySlug.set(piece, set.slug);
}

const catalog = ITEM_SEED
  .filter((it) => EQUIP_CATEGORIES.has(it.category))
  .map((it) => {
    const base = { tier: it.tier, rarity: it.rarity, category: it.category, sub_type: it.sub_type };
    return {
      slug: it.slug,
      name: it.name,
      category: it.category,
      sub_type: it.sub_type || undefined,
      tier: it.tier,
      rarity: it.rarity,
      class_req: it.class_req || undefined,
      set_slug: setBySlug.get(it.slug) || null,
      theme: fallbackTheme(base),
    };
  });

const outDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'assets', 'items3d');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, 'catalog.json');
await writeFile(outFile, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`временен каталог: ${catalog.length} предмета -> ${outFile}`);
