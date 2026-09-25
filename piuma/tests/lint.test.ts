import assert from 'node:assert/strict';
import test from 'node:test';
import { hasBlockingFindings, lintPost, type LintablePost } from '../src/content/lint.js';

function post(overrides: Partial<LintablePost> = {}): LintablePost {
  return {
    kind: 'IMAGE',
    caption: 'Кукичка на първи ред.\n\nОстаналото обяснява защо си струва.',
    hashtags: ['#дупница', '#kangoojumps'],
    altText: 'Жена скача с Kangoo Jumps обувки в студио.',
    mediaUrl: 'https://cdn.example.com/img.jpg',
    ...overrides,
  };
}

test('изряден пост няма находки', () => {
  assert.deepEqual(lintPost(post()), []);
});

test('празен caption е блокиращ', () => {
  const findings = lintPost(post({ caption: '   ' }));
  assert.ok(hasBlockingFindings(findings));
  assert.ok(findings.some((f) => f.rule === 'caption-empty'));
});

test('caption над 2200 знака е блокиращ', () => {
  const findings = lintPost(post({ caption: 'а'.repeat(2201) }));
  assert.ok(findings.some((f) => f.rule === 'caption-too-long' && f.severity === 'HIGH'));
});

test('тайна в caption е блокираща', () => {
  const findings = lintPost(post({ caption: 'ключ sk-ant-api03-XXXXXXXXXXXX' }));
  assert.ok(hasBlockingFindings(findings));
});

test('медия без HTTPS е блокираща', () => {
  const findings = lintPost(post({ mediaUrl: 'http://cdn.example.com/img.jpg' }));
  assert.ok(findings.some((f) => f.rule === 'media-not-https' && f.severity === 'HIGH'));
});

test('над 30 хаштага е блокиращо', () => {
  const hashtags = Array.from({ length: 31 }, (_, i) => `#таг${i}`);
  const findings = lintPost(post({ hashtags }));
  assert.ok(findings.some((f) => f.rule === 'hashtags-over-limit' && f.severity === 'HIGH'));
});

test('липсващ alt текст е MEDIUM, не блокира', () => {
  const findings = lintPost(post({ altText: '' }));
  assert.ok(findings.some((f) => f.rule === 'alt-missing' && f.severity === 'MEDIUM'));
  assert.equal(hasBlockingFindings(findings), false);
});

test('линк в caption се маркира, а без utm_source дава INFO', () => {
  const findings = lintPost(post({ caption: 'Виж https://evanita-bg.com/график' }));
  assert.ok(findings.some((f) => f.rule === 'link-in-caption'));
  assert.ok(findings.some((f) => f.rule === 'link-without-utm' && f.severity === 'INFO'));
});
