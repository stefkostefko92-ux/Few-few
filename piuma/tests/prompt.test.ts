import assert from 'node:assert/strict';
import test from 'node:test';
import { brandPlanSchema } from '../src/content/plan.js';
import { buildUserPrompt } from '../src/content/prompt.js';

const brand = {
  name: 'Evanita Sport',
  summary: 'Студио за Kangoo Jumps.',
  voice: 'Енергично.',
  language: 'bg',
};

test('без план и без данни промптът е базовият', () => {
  const text = buildUserPrompt({ brand, kind: 'IMAGE', topic: 'График', count: 2 });
  assert.match(text, /Бранд: Evanita Sport/);
  assert.match(text, /точно 2 различни чернови/);
  assert.doesNotMatch(text, /План за поддръжка/);
  assert.match(text, /variants: празен списък/);
});

test('планът, данните от Insights и платформите влизат в промпта', () => {
  const plan = brandPlanSchema.parse({
    pillars: ['Зад кулисите'],
    keywords: ['kangoo jumps'],
    hashtagSets: [['#kangoojumps']],
    cta: 'Запиши пробна.',
    avoid: 'Без обещания за килограми.',
    crossPost: ['facebook', 'x'],
  });
  const text = buildUserPrompt({
    brand,
    kind: 'REELS',
    topic: 'Първа тренировка',
    count: 1,
    plan,
    performance: {
      top: [{ caption: 'Силен пост', kind: 'REELS', reach: 1200, interactions: 90 }],
      weak: [{ caption: 'Слаб пост', kind: 'IMAGE', reach: 100, interactions: 2 }],
      bestKind: 'REELS',
      bestTopic: 'Зад кулисите',
      sample: 14,
    },
    crossPost: plan.crossPost,
  });
  assert.match(text, /Ключови думи за откриваемост.*kangoo jumps/);
  assert.match(text, /Забранено: Без обещания за килограми\./);
  assert.match(text, /Силен \(REELS, обхват 1200, взаимодействия 90\)/);
  assert.match(text, /Слаб \(IMAGE, обхват 100/);
  // Формулировката следва мярката: ангажираност, не обхват. Обхватът расте с
  // последователите и старият текст описваше точно дефекта, който беше поправен.
  assert.match(text, /Форматът с по-добра ангажираност досега: Reels/);
  assert.match(text, /Темата с по-добра ангажираност досега: „Зад кулисите“/);
  // Бройката зад извода влиза в промпта — моделът вижда на колко данни стъпва.
  assert.match(text, /Зад изводите стоят 14 публикувани поста/);
  assert.match(text, /Facebook:/);
  assert.match(text, /X: до 280 знака/);
  assert.doesNotMatch(text, /TikTok:/);
});

test('дълъг caption от Insights се реже, за да не издува промпта', () => {
  const text = buildUserPrompt({
    brand,
    kind: 'IMAGE',
    topic: 'x',
    count: 1,
    performance: {
      top: [{ caption: 'а'.repeat(500), kind: 'IMAGE', reach: 1, interactions: 1 }],
      weak: [],
      bestKind: null,
    },
  });
  const line = text.split('\n').find((l) => l.startsWith('- Силен'));
  assert.ok(line && line.length < 220, 'редът трябва да е отрязан');
});
