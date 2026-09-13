import assert from 'node:assert/strict';
import test from 'node:test';
import {
  draftsNeeded,
  kindMix,
  nextPillars,
  nextSlots,
  pickAssets,
} from '../src/content/schedule.js';
import type { BrandAsset } from '../src/content/plan.js';

test('нужните чернови допълват до плана и никога не са отрицателни', () => {
  assert.equal(draftsNeeded({ postsPerWeek: 3 }, 1), 2);
  assert.equal(draftsNeeded({ postsPerWeek: 3 }, 5), 0);
});

test('смесицата спазва дела, но само където има материал', () => {
  assert.deepEqual(kindMix(4, 0.5, { image: 10, reels: 10 }), ['REELS', 'REELS', 'IMAGE', 'IMAGE']);
  assert.deepEqual(kindMix(4, 0.5, { image: 10, reels: 0 }), ['IMAGE', 'IMAGE', 'IMAGE', 'IMAGE']);
  assert.deepEqual(kindMix(3, 1, { image: 2, reels: 1 }), ['REELS', 'IMAGE', 'IMAGE']);
  assert.deepEqual(kindMix(3, 0, { image: 0, reels: 0 }), []);
});

const asset = (url: string, kind: 'IMAGE' | 'REELS' = 'IMAGE'): BrandAsset => ({
  url,
  kind,
  description: 'материал',
});

test('материалите се редуват — никога ползваният е пръв, после най-старият', () => {
  const assets = [
    asset('https://a/1.jpg'),
    asset('https://a/2.jpg'),
    asset('https://a/3.mp4', 'REELS'),
  ];
  const used = new Map([
    ['https://a/1.jpg', new Date('2026-09-01')],
    ['https://a/3.mp4', new Date('2026-08-01')],
  ]);
  const picked = pickAssets(assets, used, ['IMAGE', 'IMAGE', 'REELS', 'REELS']);
  assert.deepEqual(
    picked.map((a) => a.url),
    ['https://a/2.jpg', 'https://a/1.jpg', 'https://a/3.mp4'],
  );
});

test('стълбовете продължават от там, докъдето е стигнато', () => {
  assert.deepEqual(nextPillars(['A', 'B', 'C'], 4, 2), ['B', 'C']);
  assert.deepEqual(nextPillars([], 0, 2), []);
});

test('слотовете започват от утре, по предпочитаните часове, и прескачат заетите', () => {
  const from = new Date(2026, 8, 9, 15, 0, 0); // сряда 15:00 локално
  const taken = new Set([new Date(2026, 8, 10, 8, 30).getTime()]);
  const slots = nextSlots(['20:00', '08:30'], 3, from, taken);
  assert.deepEqual(
    slots.map((d) => [d.getDate(), d.getHours(), d.getMinutes()]),
    [
      [10, 20, 0],
      [11, 8, 30],
      [11, 20, 0],
    ],
  );
});
