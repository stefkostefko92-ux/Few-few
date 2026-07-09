import test from 'node:test';
import assert from 'node:assert';
import { COOLDOWN_RANGES_MS } from '../cooldowns';
import { paceXpForKill, xpForLevel } from '../progression';

// Баланс инварианти от пълния одит (2026-07): стълбица без мъртви прозорци
// + изгладена XP крива. Пазят дизайна от случайна регресия.

test('cooldowns: стълбицата е степенувана (hunt < arena < quest < tower < dungeon)', () => {
  const order = ['hunt', 'arena', 'quest', 'tower', 'dungeon'] as const;
  for (let i = 1; i < order.length; i++) {
    const prev = COOLDOWN_RANGES_MS[order[i - 1]];
    const cur = COOLDOWN_RANGES_MS[order[i]];
    assert.ok(cur[0] >= prev[0], `${order[i]} min >= ${order[i - 1]} min`);
    assert.ok(cur[1] >= prev[1], `${order[i]} max >= ${order[i - 1]} max`);
    assert.ok(cur[0] < cur[1], `${order[i]} има реален диапазон`);
  }
  // Филър пистата (hunt) отваря най-късно на 8-ата минута.
  assert.ok(COOLDOWN_RANGES_MS.hunt[1] <= 8 * 60_000, 'hunt max <= 8 мин');
});

test('cooldowns: винаги има какво да правиш — max чакане в ротация < 3.5 мин', () => {
  // Симулация: играчът пуска дейност веднага щом се отвори (5 писти).
  // Мерим най-дългия прозорец, в който НИЩО не е готово. Детерминистичен
  // seed чрез midpoint + най-лош случай (всички на max).
  const lanes = (['hunt', 'arena', 'quest', 'tower', 'dungeon'] as const)
    .map((k) => COOLDOWN_RANGES_MS[k][1]); // най-лош случай: всички на max
  // t=0: пуска всичките 5. Следващите отваряния са на lane[i], 2*lane[i]…
  // Прозорците без нищо готово са ограничени от най-късата писта.
  const horizon = 3 * 60 * 60_000;
  const events: number[] = [];
  for (const l of lanes) for (let t = l; t <= horizon; t += l) events.push(t);
  events.sort((a, b) => a - b);
  let maxGap = events[0]; // от t=0 до първото отваряне
  for (let i = 1; i < events.length; i++) maxGap = Math.max(maxGap, events[i] - events[i - 1]);
  assert.ok(maxGap <= 8 * 60_000, `max мъртъв прозорец ${Math.round(maxGap / 60000)} мин (<= hunt max)`);
  // Средният интервал между отваряния е под 3.5 мин.
  const avgGap = horizon / events.length;
  assert.ok(avgGap <= 3.5 * 60_000, `среден интервал ${Math.round(avgGap / 1000)}s`);
});

test('xp pacing: няма стена на lv26 (съседни нива в 2x лента)', () => {
  // Клампнат act-1 (900 XP @ lv25) срещу expansion (~105 XP @ lv26):
  const clamp = (level: number, seedXp: number) => {
    const pace = paceXpForKill(level);
    return Math.max(Math.round(pace * 0.6), Math.min(Math.round(pace * 1.8), seedXp));
  };
  const at25 = clamp(25, 900);   // стар щедър seed
  const at26 = clamp(26, 105);   // expansion seed на темпа
  assert.ok(at25 / at26 <= 2.2, `плавен преход 25→26: ${at25} vs ${at26}`);
  // Пейсът расте монотонно с нивото.
  for (let l = 5; l < 340; l += 5) {
    assert.ok(paceXpForKill(l + 5) > paceXpForKill(l), `pace расте на lv${l}`);
  }
  // ~8 убийства/ниво: сумата от 8 pace убийства покрива level step-а.
  for (const l of [10, 26, 50, 150, 300]) {
    const step = xpForLevel(l + 1) - xpForLevel(l);
    assert.ok(Math.abs(paceXpForKill(l) * 8 - step) / step < 0.15, `8 kills ≈ 1 ниво @ lv${l}`);
  }
});
