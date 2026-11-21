import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  envSetting,
  isSecretSetting,
  last4,
  planSettingUpdates,
  revolutSwitchCheck,
  SETTING_GROUPS,
  SETTING_KEYS,
  validateSetting,
} from '../settings-spec';

// docs/security-2fa-settings-spec.md (В): само Revolut и Brevo; проверка на формата.
// Стойностите с вид на ключове се сглобяват по време на изпълнение (secret-scan/gitleaks).
const fake = (...parts: string[]) => parts.join('');
const SK = fake('sk', '_', 'abcdefghijklmnop1234');
const WSK = fake('wsk', '_', 'abcdefgh123');
const BREVO = fake('xkeysib', '-', 'a1'.repeat(20));

test('само Revolut и Brevo — друг доставчик на плащания няма', () => {
  assert.deepEqual(SETTING_KEYS.map((k) => k.split('.')[0]).filter((v, i, a) => a.indexOf(v) === i), ['revolut', 'brevo']);
});

test('тайните са шифровани, нетайните — не', () => {
  assert.equal(isSecretSetting('revolut.secretKey'), true);
  assert.equal(isSecretSetting('brevo.apiKey'), true);
  assert.equal(isSecretSetting('revolut.env'), false);
  assert.equal(isSecretSetting('brevo.sender'), false);
});

test('формат: ключ в грешно поле или боклук → отказ', () => {
  assert.ok(validateSetting('revolut.secretKey', SK));
  assert.equal(validateSetting('revolut.secretKey', BREVO), null);
  assert.equal(validateSetting('revolut.secretKey', fake('sk', '_ with space')), null);
  assert.ok(validateSetting('revolut.webhookSecret', WSK));
  // Схемата на Revolut няма шаблон за тайната — друг префикс минава, ключ в грешно поле — не.
  assert.ok(validateSetting('revolut.webhookSecret', fake('whsec', '_', 'abcdefgh123')));
  assert.equal(validateSetting('revolut.webhookSecret', SK), null);
  assert.equal(validateSetting('revolut.webhookSecret', BREVO), null);
  assert.equal(validateSetting('revolut.env', 'prod'), null);
  assert.equal(validateSetting('revolut.env', 'production'), 'production');
  assert.ok(validateSetting('brevo.apiKey', BREVO));
  assert.equal(validateSetting('brevo.apiKey', SK), null);
  assert.equal(validateSetting('brevo.sender', 'Linketto <no-reply@example.com>'), 'Linketto <no-reply@example.com>');
  assert.equal(validateSetting('brevo.sender', 'no-reply@example.com'), 'no-reply@example.com');
  assert.equal(validateSetting('brevo.sender', 'не е адрес'), null);
  assert.equal(last4(fake('xkeysib', '-abcd1234')), '1234');
});

test('формата на админа: празно = без промяна, невалидно = нищо не се записва', () => {
  const form = (values: Record<string, string>) => (key: string) => values[key] ?? null;
  // Само попълнените полета се записват (тайната не се показва, затова празно = същата).
  assert.deepEqual(
    planSettingUpdates('revolut', form({ 'revolut.secretKey': `  ${SK} `, 'revolut.webhookSecret': '', 'revolut.env': 'production' })),
    { ok: true, updates: [{ key: 'revolut.secretKey', value: SK }, { key: 'revolut.env', value: 'production' }] },
  );
  // Едно невалидно поле спира целия запис (без частично приложени ключове).
  assert.deepEqual(
    planSettingUpdates('revolut', form({ 'revolut.secretKey': SK, 'revolut.webhookSecret': fake('xkeysib', '-грешно') })),
    { ok: false, invalid: 'revolut.webhookSecret' },
  );
  // Полета от друга група се игнорират (Brevo формата не пипа Revolut).
  assert.deepEqual(planSettingUpdates('brevo', form({ 'revolut.secretKey': SK })), { ok: true, updates: [] });
  assert.deepEqual(SETTING_GROUPS.revolut, ['revolut.secretKey', 'revolut.webhookSecret', 'revolut.env']);
  assert.deepEqual(SETTING_GROUPS.brevo, ['brevo.apiKey', 'brevo.sender']);
});

test('резерва от .env: празна или само интервали = липсва', () => {
  assert.equal(envSetting('brevo.apiKey', { BREVO_API_KEY: `  ${BREVO}  ` }), BREVO);
  assert.equal(envSetting('brevo.apiKey', { BREVO_API_KEY: '   ' }), null);
  assert.equal(envSetting('revolut.env', {}), null);
});

test('смяна на Revolut ключ/среда при висящи поръчки: само с изрично потвърждение на броя', () => {
  const env = (value: string) => ({ key: 'revolut.env' as const, value });
  const key = { key: 'revolut.secretKey' as const, value: SK };
  // Няма висящи — свободно.
  assert.deepEqual(revolutSwitchCheck({ updates: [env('production')], currentEnv: 'sandbox', openOrders: 0, confirmed: null }), { blocked: false, envChanged: true });
  // Висящи + смяна на средата/ключа → спира, докато не е потвърден точният брой.
  assert.equal(revolutSwitchCheck({ updates: [env('production')], currentEnv: 'sandbox', openOrders: 2, confirmed: null }).blocked, true);
  assert.equal(revolutSwitchCheck({ updates: [key], currentEnv: 'sandbox', openOrders: 2, confirmed: '1' }).blocked, true);
  assert.equal(revolutSwitchCheck({ updates: [key], currentEnv: 'sandbox', openOrders: 2, confirmed: '2' }).blocked, false);
  // Същата среда (липсваща = sandbox) не е смяна; тайната на уебхука сама не е рискова.
  assert.deepEqual(revolutSwitchCheck({ updates: [env('sandbox')], currentEnv: null, openOrders: 5, confirmed: null }), { blocked: false, envChanged: false });
  assert.equal(revolutSwitchCheck({ updates: [{ key: 'revolut.webhookSecret', value: WSK }], currentEnv: 'production', openOrders: 5, confirmed: null }).blocked, false);
});
