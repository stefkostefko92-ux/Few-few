import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, settingFromForm } from '../src/admin/settings-form.js';
import { applyXpMultiplier } from '../src/levels.js';
import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  multiplierTenths,
  parseMultiplier,
  parseSetting,
  safeChatText,
} from '../src/settings.js';

test('§11: текстът към чата се чисти като Text.SafeText в C#', () => {
  assert.equal(safeChatText('  {Red}Здрасти\u0007 всички  '), '(Red)Здрасти всички');
  assert.equal(safeChatText('a\u0085b\u007fc'), 'abc');
  assert.equal(safeChatText('x'.repeat(300)).length, 192);
  // Емоджи (сурогатна двойка) не се цепи на тавана.
  assert.equal(safeChatText(`${'x'.repeat(191)}😀`), 'x'.repeat(191));
});

test('§11: множителят от формата — 1…3 със стъпка 0,1, в десети без float', () => {
  assert.equal(parseMultiplier('1,5'), 1.5);
  assert.equal(parseMultiplier('2'), 2);
  assert.equal(parseMultiplier(' 3.0 '), 3);
  for (const bad of ['3.1', '0.9', '1.55', 'abc', '', '-1', '1e1']) {
    assert.equal(parseMultiplier(bad), null, bad);
  }
  assert.equal(multiplierTenths(1.5), 15);
  assert.equal(multiplierTenths(9), 30, 'таван');
});

test('§3: XP × множител = floor(xp · m10 / 10) — същите стойности като в C#', () => {
  assert.equal(applyXpMultiplier(15, 15), 22);
  assert.equal(applyXpMultiplier(10, 30), 30);
  assert.equal(applyXpMultiplier(7, 10), 7);
  assert.equal(applyXpMultiplier(25, 12), 30);
  assert.equal(applyXpMultiplier(10, 99), 30, 'таван ×3');
  assert.equal(applyXpMultiplier(10, 0), 10, 'долу ×1');
});

test('§11: стойностите по подразбиране минават собствените си схеми', () => {
  for (const key of SETTING_KEYS) {
    assert.deepEqual(parseSetting(key, SETTING_DEFAULTS[key]), SETTING_DEFAULTS[key], key);
  }
  assert.equal(parseSetting('bots', { quota: 10, extra: 1 }), null, 'строга схема');
  assert.equal(parseSetting('bots', { quota: 17 }), null);
  assert.equal(parseSetting('xp', { multiplier: 1.55 }), null);
  assert.equal(
    parseSetting('adverts', { ...SETTING_DEFAULTS.adverts, custom: { bg: ['{Red}x'], en: [] } }),
    null,
    'нечист текст в базата не минава',
  );
});

test('§11: формата на рекламите → стойност; невалиден интервал → нищо', () => {
  const body = {
    intervalSec: '300',
    b_carbonstealth: 'on',
    b_site: 'on',
    bg_0: '  Влез в {Gold}Discord ',
    bg_1: '',
    bg_3: 'Втори текст',
    en_4: 'Join our Discord',
  };
  assert.deepEqual(settingFromForm('adverts', body), {
    intervalSec: 300,
    builtin: { carbonstealth: true, adblock: false, site: true },
    custom: { bg: ['Влез в (Gold)Discord', 'Втори текст'], en: ['Join our Discord'] },
  });
  assert.equal(settingFromForm('adverts', { ...body, intervalSec: '30' }), null);
  assert.equal(settingFromForm('adverts', { ...body, intervalSec: '0' })?.intervalSec, 0);
  assert.equal(settingFromForm('adverts', { ...body, bg_0: 'x'.repeat(401) }), null);
  assert.deepEqual(settingFromForm('bots', { quota: '16' }), { quota: 16 });
  assert.equal(settingFromForm('bots', { quota: '17' }), null);
  assert.deepEqual(settingFromForm('xp', { multiplier: '2,5' }), { multiplier: 2.5 });
  assert.deepEqual(settingFromForm('ammo', {}), { infiniteReserve: false });
  assert.deepEqual(settingFromForm('join', { welcome: 'on' }), { welcome: true });
  assert.equal(settingFromForm('join', null), null);
});

test('сравнението на JSON не зависи от реда на ключовете (jsonb ги пренарежда)', () => {
  assert.equal(
    canonicalJson({ b: 1, a: { d: 2, c: [1, 2] } }),
    canonicalJson({ a: { c: [1, 2], d: 2 }, b: 1 }),
  );
  assert.notEqual(canonicalJson({ a: 1 }), canonicalJson({ a: 2 }));
  assert.notEqual(canonicalJson(null), canonicalJson({}));
});
