import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assetToLine,
  brandPlanSchema,
  parseAssetLine,
  parsePlan,
  planFromForm,
} from '../src/content/plan.js';

test('планът от формата се валидира с подразбирания', () => {
  const raw = planFromForm({
    postsPerWeek: '4',
    pillars: 'Зад кулисите\nСъвет на седмицата\n',
    keywords: 'kangoo jumps, дупница',
    hashtagSets: '#kangoojumps #дупница\nсила жени',
    crossPost: ['facebook', 'tiktok'],
    assets:
      'https://cdn.example.com/a.jpg | Група на тренировка\nREELS https://cdn.example.com/b.mp4 | Скокове | https://cdn.example.com/b.jpg',
  });
  const plan = brandPlanSchema.parse(raw);
  assert.equal(plan.postsPerWeek, 4);
  assert.equal(plan.reelsShare, 0.5);
  assert.deepEqual(plan.pillars, ['Зад кулисите', 'Съвет на седмицата']);
  assert.deepEqual(plan.postingTimes, ['08:30', '20:00']);
  assert.deepEqual(plan.keywords, ['kangoo jumps', 'дупница']);
  assert.deepEqual(plan.hashtagSets, [
    ['#kangoojumps', '#дупница'],
    ['#сила', '#жени'],
  ]);
  assert.deepEqual(plan.crossPost, ['facebook', 'tiktok']);
  assert.equal(plan.assets.length, 2);
  assert.deepEqual(plan.assets[1], {
    url: 'https://cdn.example.com/b.mp4',
    kind: 'REELS',
    description: 'Скокове',
    coverUrl: 'https://cdn.example.com/b.jpg',
  });
});

test('без стълбове няма план', () => {
  assert.equal(parsePlan(brandPlanSchema.safeParse(planFromForm({})).data ?? {}), null);
  assert.equal(parsePlan(null), null);
  assert.equal(parsePlan({ pillars: [] }), null);
});

test('материал без https URL или без описание е невалиден', () => {
  assert.equal(
    parsePlan({ pillars: ['Тема'], assets: [{ url: 'not-a-url', description: 'ok' }] }),
    null,
  );
  assert.equal(
    parsePlan({ pillars: ['Тема'], assets: [{ url: 'https://x.y/z.jpg', description: 'a' }] }),
    null,
  );
});

test('редът на материала е обратим', () => {
  const line = 'REELS https://cdn.example.com/b.mp4 | Скокове | https://cdn.example.com/b.jpg';
  const parsed = parseAssetLine(line);
  assert.equal(assetToLine({ ...parsed, kind: parsed.kind }), line);
  assert.equal(
    assetToLine(parseAssetLine('https://cdn.example.com/a.jpg | Снимка')),
    'https://cdn.example.com/a.jpg | Снимка',
  );
});

test('часовете трябва да са HH:MM', () => {
  assert.equal(parsePlan({ pillars: ['Тема'], postingTimes: ['8:30'] }), null);
  assert.ok(parsePlan({ pillars: ['Тема'], postingTimes: ['08:30'] }));
});
