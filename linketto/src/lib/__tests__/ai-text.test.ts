import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBio, geminiAllowed } from '../ai-text';

test('cleanBio маха обгръщащи кавички и маркдаун', () => {
  assert.equal(cleanBio('"Здравей, аз съм Мария."'), 'Здравей, аз съм Мария.');
  assert.equal(cleanBio('„Дизайнер“'), 'Дизайнер');
  assert.equal(cleanBio('**Bold** _text_ `code`'), 'Bold text code');
});

test('cleanBio събира интервали и реже до 280', () => {
  assert.equal(cleanBio('a\n\n  b   c'), 'a b c');
  assert.equal(cleanBio('x'.repeat(400)).length, 280);
});

test('geminiAllowed: само ключ + платен tier (fail-closed за ЕИП)', () => {
  assert.equal(geminiAllowed({ GEMINI_API_KEY: 'k', GEMINI_PAID_TIER: '1' }), true);
  assert.equal(geminiAllowed({ GEMINI_API_KEY: 'k' }), false);
  assert.equal(geminiAllowed({ GEMINI_API_KEY: 'k', GEMINI_PAID_TIER: 'yes' }), false);
  assert.equal(geminiAllowed({ GEMINI_PAID_TIER: '1' }), false);
});
