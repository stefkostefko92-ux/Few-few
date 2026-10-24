import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyXpMultiplier,
  botKillXp,
  bountyFor,
  levelForXp,
  levelProgress,
  xpForLevel,
} from '../src/levels.js';

test('нивото по формулата отговаря на тестовите стойности от CONTRACT.md §3', () => {
  // 0→1 · 99→1 · 100→2 · 299→2 · 300→3 · 599→3 · 600→4 · 4500→10
  const cases: Array<[number, number]> = [
    [0, 1],
    [99, 1],
    [100, 2],
    [299, 2],
    [300, 3],
    [599, 3],
    [600, 4],
    [4500, 10],
  ];
  for (const [xp, level] of cases) {
    assert.equal(levelForXp(xp), level, `${xp} XP`);
    assert.equal(levelForXp(BigInt(xp)), level, `${xp} XP (bigint)`);
  }
});

test('прагът на ниво n е 100 · n · (n − 1) / 2 и границите са точни', () => {
  for (let n = 1; n <= 500; n += 1) {
    const start = xpForLevel(n);
    assert.equal(start, (100n * BigInt(n) * BigInt(n - 1)) / 2n);
    assert.equal(levelForXp(start), n, `началото на ниво ${n}`);
    if (start > 0n) assert.equal(levelForXp(start - 1n), n - 1, `точно под ниво ${n}`);
  }
});

test('огромно XP (BIGINT от базата) не губи точност на границата', () => {
  const n = 2_000_000;
  const start = xpForLevel(n);
  assert.equal(levelForXp(start), n);
  assert.equal(levelForXp(start - 1n), n - 1);
});

test('отрицателно или невалидно XP се брои за нула', () => {
  assert.equal(levelForXp(-50), 1);
  assert.equal(levelForXp(Number.NaN), 1);
  assert.equal(levelForXp(-5n), 1);
});

test('напредъкът е вътре в текущото ниво и никога не стига 100 %', () => {
  assert.deepEqual(levelProgress(0), {
    level: 1,
    current: 0n,
    span: 100n,
    percent: 0,
    nextLevel: 2,
  });
  const mid = levelProgress(450);
  assert.equal(mid.level, 3);
  assert.equal(mid.current, 150n);
  assert.equal(mid.span, 300n);
  assert.equal(mid.percent, 50);
  assert.equal(levelProgress(599).percent, 99);
});

test('баунтито: от серия 5, по 25 XP, таван 250', () => {
  assert.equal(bountyFor(4), 0);
  assert.equal(bountyFor(5), 25);
  assert.equal(bountyFor(8), 100);
  assert.equal(bountyFor(14), 250);
  assert.equal(bountyFor(40), 250);
});

test('убийство на бот дава половината XP надолу — същите стойности като C# (LogicTests)', () => {
  const cases: Array<[number, number]> = [
    [10, 5],
    [15, 7],
    [45, 22],
    [1, 0],
    [0, 0],
    [-8, 0],
  ];
  for (const [xp, expected] of cases) assert.equal(botKillXp(xp), expected, `${xp} XP`);
  // Множителят е преди делението: 15 × 2,0 = 30 → 15.
  assert.equal(botKillXp(applyXpMultiplier(15, 20)), 15);
});
