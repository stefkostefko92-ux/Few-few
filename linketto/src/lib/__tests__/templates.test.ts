import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STYLE, parseStyle, styleSchema } from '../style';
import {
  applyTemplate,
  isTemplateId,
  NICHE_TEMPLATES,
  TEMPLATE_IDS,
} from '../templates';

test('всеки шаблон е валиден стил и има hex акцент', () => {
  for (const id of TEMPLATE_IDS) {
    assert.ok(styleSchema.safeParse(applyTemplate(DEFAULT_STYLE, id)).success, id);
    assert.match(NICHE_TEMPLATES[id].accent, /^#[0-9a-f]{6}$/i, id);
  }
});

test('applyTemplate пази съдържанието и платените настройки', () => {
  const current = parseStyle({
    avatarUrl: '/media/avatar-abc.webp',
    bgImageUrl: '/media/bg-abc.webp',
    hideBadge: true,
    showViews: true,
    mediaKit: true,
    font: 'mono',
  });
  const next = applyTemplate(current, 'restaurant');
  assert.equal(next.avatarUrl, '/media/avatar-abc.webp');
  assert.equal(next.bgImageUrl, '/media/bg-abc.webp');
  assert.equal(next.hideBadge, true);
  assert.equal(next.showViews, true);
  assert.equal(next.mediaKit, true);
  assert.equal(next.font, 'serif'); // визуалното идва от шаблона
});

test('applyTemplate нулира визуалните полета, които шаблонът не задава', () => {
  const current = parseStyle({ layout: 'grid', bgEffect: 'aurora' });
  const next = applyTemplate(current, 'shop');
  assert.equal(next.layout, 'list');
  assert.equal(next.bgEffect, 'none');
});

test('isTemplateId', () => {
  assert.ok(isTemplateId('musician'));
  assert.ok(!isTemplateId('hacker'));
  assert.ok(!isTemplateId(''));
});
