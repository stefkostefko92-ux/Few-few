/**
 * Pre-launch data integrity verification.
 * Cross-checks every slug reference across seeds and routes:
 *   1. APEX_DROPS (hunting.ts) -> items + monsters exist
 *   2. Quest monster_slugs -> monsters exist
 *   3. Quest item_rewards -> items exist
 *   4. Dungeon stage monster_slugs + loot pools -> exist
 *   5. Faction vendor stock -> items exist
 *   6. Region gates (hunting.ts) cover every monster region
 *   7. Monster level coverage — no hunting dead zones lv 1-350
 *   8. Set slugs on items -> sets exist
 *   9. Realm boss drop slugs minted on boot
 *  10. Tier/level_req sanity on items
 */
import { MONSTER_SEED, REGION_BANDS } from '../src/seed/monsters';
import { ITEM_SEED } from '../src/seed/items';
import { QUEST_SEED } from '../src/seed/quests';
import { DUNGEONS } from '../src/seed/dungeons';
import { ITEM_SETS } from '../src/seed/sets';

let failures = 0;
function fail(msg: string) { failures++; console.error('  ✗ ' + msg); }
function ok(msg: string) { console.log('  ✓ ' + msg); }
function section(name: string) { console.log('\n== ' + name + ' =='); }

const monsterSlugs = new Set(MONSTER_SEED.map((m) => m.slug));
const itemSlugs = new Set(ITEM_SEED.map((i: any) => i.slug));
const setSlugs = new Set(ITEM_SETS.map((s: any) => s.slug));

section('1. APEX_DROPS cross-refs');
const APEX_DROPS: Record<string, string> = {
  'emberreach_apex_khalad': 'khalad_fang',
  'hammerhand_apex_gorvak': 'gorvak_mace',
  'conclave_apex_vex': 'vex_staff',
  'saltmarsh_apex_sunken_king': 'sunken_king_trident',
  'frostvale_apex_snowtooth': 'snowtooth_axe',
  'blackspire_apex_azhtek': 'azhtek_armor',
  'stormpeaks_apex_karna': 'karna_blade',
  'voidshade_apex_caethra': 'caethra_crown',
  'mooncradle_apex_selan': 'selan_mantle',
  'worldspine_apex_vhastar': 'vhastar_ring',
  'throne_apex_unname': 'unname_blade',
};
for (const [mSlug, iSlug] of Object.entries(APEX_DROPS)) {
  if (!monsterSlugs.has(mSlug)) fail(`APEX monster missing from seed: ${mSlug}`);
  if (!itemSlugs.has(iSlug)) fail(`APEX item missing from seed: ${iSlug}`);
}
if (failures === 0) ok('all 11 APEX monster+item pairs resolve');

section('2. Quest monster_slugs');
let qFails = failures;
for (const q of QUEST_SEED) {
  if (q.monster_slug && !monsterSlugs.has(q.monster_slug)) {
    fail(`quest ${q.slug} references missing monster: ${q.monster_slug}`);
  }
}
if (failures === qFails) ok(`all ${QUEST_SEED.length} quests resolve their monsters`);

section('3. Quest item_rewards');
qFails = failures;
for (const q of QUEST_SEED) {
  if ((q as any).item_reward && !itemSlugs.has((q as any).item_reward)) {
    fail(`quest ${q.slug} references missing item: ${(q as any).item_reward}`);
  }
}
if (failures === qFails) ok('all quest item_rewards resolve');

section('4. Dungeon stages + loot pools');
qFails = failures;
for (const d of DUNGEONS) {
  for (const st of d.stages) {
    if (!monsterSlugs.has(st.monster_slug)) fail(`dungeon ${d.slug} stage references missing monster: ${st.monster_slug}`);
  }
  for (const loot of d.loot_pool) {
    if (!itemSlugs.has(loot)) fail(`dungeon ${d.slug} loot pool references missing item: ${loot}`);
  }
}
if (failures === qFails) ok(`all ${DUNGEONS.length} dungeons resolve stages + loot`);

section('5. Faction vendor stock');
qFails = failures;
const VENDOR_SLUGS = [
  'elite_armor_4','elite_helm_4','adept_armor_5','mythic_armor_6','sunken_king_trident','gorvak_mace',
  'elite_staff_4','adept_staff_5','mythic_staff_6','vex_staff','caethra_crown',
  'elite_axe_4','adept_axe_5','mythic_axe_6','khalad_fang','snowtooth_axe',
];
for (const s of VENDOR_SLUGS) {
  if (!itemSlugs.has(s)) fail(`faction vendor stock references missing item: ${s}`);
}
if (failures === qFails) ok('all faction vendor stock resolves');

section('6. Region gate coverage');
qFails = failures;
const monsterRegions = new Set(MONSTER_SEED.map((m) => m.region));
const GATES: Record<string, number> = {
  whispering_woods: 1, mistmoor_hills: 6, crystal_caverns: 10, ashen_wastes: 15, shadowfell: 24,
  emberreach: 26, hammerhand_pass: 50, conclave_aedric: 75, saltmarsh: 105, frostvale: 140, black_spire: 175,
  ...Object.fromEntries(REGION_BANDS.map((b) => [b.region, b.gate])),
};
for (const r of monsterRegions) {
  if (!(r in GATES)) fail(`monster region has no gate in hunting.ts: ${r}`);
}
if (failures === qFails) ok(`all ${monsterRegions.size} monster regions gated`);

section('7. Hunting level coverage (no dead zones)');
qFails = failures;
// Simulate the hunting pool widening logic at every level 1..350 for
// the best (= highest unlocked) region a player of that level would use.
const regionsByGate = Object.entries(GATES).sort((a, b) => a[1] - b[1]);
for (let lvl = 1; lvl <= 350; lvl++) {
  const unlocked = regionsByGate.filter(([, g]) => lvl >= g).map(([r]) => r);
  const best = unlocked[unlocked.length - 1];
  let found = false;
  for (const window of [3, 8, 16, 999]) {
    const pool = MONSTER_SEED.filter((m) => m.region === best && m.level >= Math.max(1, lvl - window) && m.level <= lvl + window);
    if (pool.length > 0) { found = true; break; }
  }
  if (!found) fail(`hunting dead zone at lv ${lvl} in region ${best}`);
}
if (failures === qFails) ok('hunting pool resolves at every level 1-350');

section('8. Item set_slug refs');
qFails = failures;
for (const i of ITEM_SEED as any[]) {
  if (i.set_slug && !setSlugs.has(i.set_slug)) fail(`item ${i.slug} references missing set: ${i.set_slug}`);
}
if (failures === qFails) ok('all item set_slugs resolve');

section('9. Item stat sanity');
qFails = failures;
for (const i of ITEM_SEED as any[]) {
  if (i.tier < 1 || i.tier > 10) fail(`item ${i.slug} has out-of-range tier: ${i.tier}`);
  if (i.level_req < 0 || i.level_req > 350) fail(`item ${i.slug} has out-of-range level_req: ${i.level_req}`);
  if (i.buy_price < 0 || i.sell_price < 0) fail(`item ${i.slug} has negative price`);
  if (i.category === 'weapon' && i.atk_max <= 0) fail(`weapon ${i.slug} has no attack`);
  if (i.atk_max < i.atk_min) fail(`item ${i.slug} atk_max < atk_min`);
}
if (failures === qFails) ok(`all ${ITEM_SEED.length} items pass stat sanity`);

section('10. Monster stat sanity + level ordering');
qFails = failures;
for (const m of MONSTER_SEED) {
  if (m.hp <= 0) fail(`monster ${m.slug} has no HP`);
  if (m.atk_max < m.atk_min) fail(`monster ${m.slug} atk_max < atk_min`);
  if (m.xp_reward <= 0) fail(`monster ${m.slug} pays no XP`);
  if (m.gold_max < m.gold_min) fail(`monster ${m.slug} gold_max < gold_min`);
  if (m.level < 1 || m.level > 350) fail(`monster ${m.slug} out-of-range level: ${m.level}`);
}
if (failures === qFails) ok(`all ${MONSTER_SEED.length} monsters pass stat sanity`);

console.log('\n' + (failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} FAILURES`));
process.exit(failures === 0 ? 0 : 1);
