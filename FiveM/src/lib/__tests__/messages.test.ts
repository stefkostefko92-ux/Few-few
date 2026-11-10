import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getDictionary } from '../../i18n';
import { errorMessage } from '../messages';
import { tagIcon } from '../icons';

const t = getDictionary('bg');

/**
 * РЕГРЕСИЯ. Търсенето беше `t.errors[code] ?? fallback` върху обектен литерал,
 * тоест минаваше през ПРОТОТИПА. `?error=__proto__` връщаше `Object.prototype`
 * — обект, не низ — и Server Component-ът гърмеше с „Objects are not valid as
 * a React child“, тоест **500 на публична страница от стойност в URL-а**.
 * `??` не хваща тези ключове: те не са `undefined`.
 */
test('ключове от прототипа не стигат до рендера', () => {
  for (const evil of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
    const message = errorMessage(evil, t);
    assert.equal(typeof message, 'string', `${evil} върна ${typeof message}, не низ`);
    assert.equal(message, t.errors.invalid, `${evil} трябва да падне към общото съобщение`);
  }
});

test('истинските кодове минават, липсващият дава null', () => {
  assert.equal(errorMessage('rate_limit', t), t.errors.rate_limit);
  assert.equal(errorMessage(undefined, t), null);
  assert.equal(errorMessage('няма-такъв-код', t), t.errors.invalid);
});

/** Същият клас дефект: етикетите са свободен текст от подателя. */
test('етикет от прототипа не става име на икона', () => {
  for (const evil of ['constructor', '__proto__', 'toString', 'valueOf']) {
    assert.equal(tagIcon(evil), null, `${evil} върна име на икона`);
  }
  assert.equal(tagIcon('heavy-rp'), 'heavy-rp');
  assert.equal(tagIcon('  ПОЛИЦИЯ  '), 'police', 'нормализира интервали и регистър');
  assert.equal(tagIcon('няма-такъв'), null);
});
