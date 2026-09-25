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
 * ползване (сезонни трофеи, realm boss, Tower of Trials), са описани в
 * RUNTIME_EQUIPABLES; скриптът проверява, че всеки slug още съществува в
 * съответния файл, иначе пада (без тих дрейф).
 */
/* eslint-disable no-console */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ITEM_SEED } from '../src/seed/items';
import { ITEM_SETS, TIER_THEMES, type SetTheme } from '../src/seed/sets';

const EQUIP = ['weapon', 'shield', 'helm', 'armor', 'gloves', 'boots', 'cloak', 'ring', 'amulet'] as const;
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, '..', 'client', 'public', 'assets', 'items3d', 'catalog.json');

interface Row {
  slug: string; name: string; category: string; sub_type: string; tier: number; rarity: string;
  class_req: string; set_slug: string | null; theme: SetTheme; icon: string; level_req: number;
}

/** Екипируеми предмети, които маршрутите вписват в БД при първо ползване. */
const RUNTIME_EQUIPABLES: { file: string; slug: string; name: string; category: string; sub_type: string; tier: number; rarity: string; level_req: number }[] = [
  { file: 'src/routes/events.ts', slug: 'season_trophy_frostmoot', name: 'Frostmoot Ledger of the Hunt', category: 'amulet', sub_type: '', tier: 9, rarity: 'legendary', level_req: 220 },
  { file: 'src/routes/events.ts', slug: 'season_trophy_bloomtide', name: "Bloomtide Hunter's Wreath", category: 'cloak', sub_type: '', tier: 9, rarity: 'legendary', level_req: 220 },
  { file: 'src/routes/events.ts', slug: 'season_trophy_sunhigh', name: 'Sunhigh Ember-Crown', category: 'helm', sub_type: '', tier: 9, rarity: 'legendary', level_req: 220 },
  { file: 'src/routes/events.ts', slug: 'season_trophy_emberfall', name: "Emberfall Reaper's Ring", category: 'ring', sub_type: '', tier: 9, rarity: 'legendary', level_req: 220 },
  { file: 'src/routes/realmBoss.ts', slug: 'realm_thalion_crown', name: 'Sunless Crown of Thalion', category: 'helm', sub_type: '', tier: 10, rarity: 'legendary', level_req: 250 },
  { file: 'src/routes/realmBoss.ts', slug: 'realm_vethryx_scale', name: 'Spine-of-Sky Scaleplate', category: 'armor', sub_type: '', tier: 10, rarity: 'legendary', level_req: 250 },
  { file: 'src/routes/realmBoss.ts', slug: 'realm_orsis_pendant', name: 'Drowned-God Pendant of Orsis', category: 'amulet', sub_type: '', tier: 10, rarity: 'legendary', level_req: 250 },
  { file: 'src/routes/realmBoss.ts', slug: 'realm_kallosh_grimoire', name: "Kallosh's Marrow Grimoire", category: 'weapon', sub_type: 'staff', tier: 10, rarity: 'legendary', level_req: 250 },
  { file: 'src/routes/realmBoss.ts', slug: 'realm_dawn_unmaker_ash', name: 'Ash of the Dawn-Unmaker', category: 'cloak', sub_type: '', tier: 10, rarity: 'legendary', level_req: 250 },
  { file: 'src/routes/realmBoss.ts', slug: 'realm_unnamed_sigil', name: "The Sigil That Wasn't Named", category: 'ring', sub_type: '', tier: 10, rarity: 'legendary', level_req: 250 },
  { file: 'src/routes/trialCache.ts', slug: 'trial_crown', name: 'Trial Crown', category: 'helm', sub_type: '', tier: 5, rarity: 'epic', level_req: 12 },
  { file: 'src/routes/trialCache.ts', slug: 'trial_aegis', name: 'Trial Aegis', category: 'armor', sub_type: '', tier: 5, rarity: 'epic', level_req: 15 },
  { file: 'src/routes/trialCache.ts', slug: 'wyrmsong_blade', name: 'Wyrmsong', category: 'weapon', sub_type: 'sword', tier: 5, rarity: 'legendary', level_req: 18 },
];

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
  for (const r of RUNTIME_EQUIPABLES) {
    const src = readFileSync(join(ROOT, r.file), 'utf8');
    if (!src.includes(`'${r.slug}'`)) throw new Error(`${r.slug} вече не е в ${r.file} — обнови RUNTIME_EQUIPABLES`);
    if (seen.has(r.slug)) continue;
    rows.push({
      slug: r.slug, name: r.name, category: r.category, sub_type: r.sub_type, tier: r.tier, rarity: r.rarity,
      class_req: '', set_slug: null, theme: TIER_THEMES[r.tier],
      icon: r.category === 'weapon' ? r.sub_type : r.category, level_req: r.level_req,
    });
  }
  for (const r of rows) if (!r.theme) throw new Error(`${r.slug}: няма тема (tier ${r.tier})`);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  const bySet = rows.filter((r) => r.set_slug).length;
  console.log(`catalog.json: ${rows.length} предмета (${bySet} части от сет, ${rows.length - bySet} с тема по тир) → ${OUT}`);
}

main();
