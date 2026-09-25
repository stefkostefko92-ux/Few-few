/**
 * Баланс отчет (детерминистичен, seeded) — `npx tsx scripts/balance-sim.ts [--before]`.
 * Ползва реалния енджин през src/game/__tests__/balanceHarness.ts; никаква БД
 * (DB_PATH=:memory:, is_npc герои). `--before` мери икономиката със старите
 * наградни формули (за таблицата преди/след в одита).
 */
process.env.DB_PATH = ':memory:';
/* eslint-disable no-console */
import * as H from '../src/game/__tests__/balanceHarness';
import * as RF from '../src/game/rewardFormulas';
import { paceXpForKill } from '../src/game/progression';
import { ITEM_SEED } from '../src/seed/items';

const before = process.argv.includes('--before');
const itemSell = new Map((ITEM_SEED as any[]).map((i) => [i.slug, i.sell_price as number]));

// Старите (преди одита) формули — буквално копие на логиката от маршрутите.
const OLD: H.Formulas = {
  ...RF,
  questBaseXp: (q) => q.xp_reward,
  questBaseGold: (q) => q.gold_reward,
  questCombatXp: (q, m) => q.xp_reward + Math.min(Math.round(paceXpForKill(m.level) * 1.8), m.xp_reward),
  mythicPlusReward: (d, _s, tier) => ({ xp: Math.round(d.xp_bonus * (1 + tier * 0.12)), gold: Math.round(d.gold_bonus * (1 + tier * 0.12)), firstClear: true }),
  questItemRepeatValue: (q: any) => (q.item_reward ? itemSell.get(q.item_reward) || 0 : 0),
  legacyApexPool: true,
};
const F: H.Formulas = before ? OLD : (RF as H.Formulas);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const k = (x: number) => (x >= 10000 ? `${(x / 1000).toFixed(0)}k` : x >= 1000 ? `${(x / 1000).toFixed(1)}k` : x.toFixed(0));

console.log(`# Nexus баланс отчет (${before ? 'ПРЕДИ' : 'СЛЕД'})\n`);
console.log('## Клас срещу клас (победи на реда, двата реда на инициатива, 300 боя × 2)');
const pairs: [H.CharacterClassT, H.CharacterClassT][] = [];
for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairs.push([H.CLASSES[i], H.CLASSES[j]]);
console.log('| ниво | ' + pairs.map(([a, b]) => `${a.slice(0, 3)}-${b.slice(0, 3)}`).join(' | ') + ' | макс отклонение |');
for (const L of [1, 10, 25, 50, 100, 200, 300, 500]) {
  const v = pairs.map(([a, b]) => H.duel(a, b, L, 300));
  console.log(`| ${L} | ${v.map(pct).join(' | ')} | ${pct(Math.max(...v.map((x) => Math.abs(x - 0.5))))} |`);
}

console.log('\n## Вход в регион (смесен клас на входното ниво срещу пула на лова, без APEX)');
console.log('| регион | вход | победа | рундове | HP остатък |');
for (const r of H.regionEntry(60)) console.log(`| ${r.region} | ${r.gate} | ${pct(r.win)} | ${r.rounds.toFixed(0)} | ${pct(r.hpLeft)} |`);

console.log('\n## Писти: XP/час и злато/час (стационарно; cooldown средно, комбо ×1.4 за лова)');
console.log('| ниво | лов XP/ч | арена | куест | кула | подземие M+ | макс/2-ри XP | лов злато/ч | арена | куест | кула | M+ | макс/2-ри злато | дневни подземия (нива) |');
for (const L of [10, 25, 50, 100, 200, 300]) {
  const e = H.economyAt(L, F);
  const xs = e.map((x) => x.xpHr).sort((a, b) => b - a);
  const gs = e.map((x) => x.goldHr).sort((a, b) => b - a);
  const dd = H.dailyDungeonXp(L);
  console.log(`| ${L} | ${e.map((x) => k(x.xpHr)).join(' | ')} | ${(xs[0] / Math.max(1, xs[1])).toFixed(1)}× | ${e.map((x) => k(x.goldHr)).join(' | ')} | ${(gs[0] / Math.max(1, gs[1])).toFixed(1)}× | ${dd.levels.toFixed(1)} |`);
  console.error(`  L${L} notes: ` + e.map((x) => `${x.lane}:${x.note ?? ''} w${pct(x.win)}`).join(' · '));
}
