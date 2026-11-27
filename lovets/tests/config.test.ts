// Настройките на черновите: празна стойност от docker-compose (`${X:-}`) значи „няма“, не грешка при старт;
// известието е https без параметри (иначе всяко писмо би носило връзка с параметри).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const fake = (label: string): string => ['t', label, 'z'.repeat(40)].join('-');
const BASE = {
  LOVETS_PEPPER: fake('pepper'),
  JWT_SECRET: fake('jwt'),
  TOTP_KEY: Buffer.alloc(32, 3).toString('base64'),
  APP_ORIGIN: 'https://lovets.example',
};

test('без настройки за черновите — стартира, черновите са изключени', () => {
  const c = loadConfig({
    ...BASE,
    LOVETS_UNSUB_KEY: '',
    LOVETS_NOTICE_URL: '',
    LOVETS_PUBLIC_URL: '',
    LOVETS_RETENTION_MONTHS: '',
  });
  assert.equal(c.unsubKey, null);
  assert.equal(c.noticeUrl, null);
  assert.equal(c.publicUrl, 'https://lovets.example');
  assert.equal(c.retentionMonths, 6);
});

test('с настройки — ключ, известие, публичен адрес, срок', () => {
  const key = Buffer.alloc(32, 4).toString('base64');
  const c = loadConfig({
    ...BASE,
    LOVETS_UNSUB_KEY: key,
    LOVETS_NOTICE_URL: 'https://carbonstealth.eu/privacy/prospects',
    LOVETS_PUBLIC_URL: 'https://u.lovets.example/',
    LOVETS_RETENTION_MONTHS: '9',
  });
  assert.equal(c.unsubKey, key);
  assert.equal(c.noticeUrl, 'https://carbonstealth.eu/privacy/prospects');
  assert.equal(c.publicUrl, 'https://u.lovets.example');
  assert.equal(c.retentionMonths, 9);
});

test('известие с параметри, по http или кратък ключ → грешка при старт (fail-closed)', () => {
  for (const extra of [
    { LOVETS_NOTICE_URL: 'https://carbonstealth.eu/privacy?utm_source=x' },
    { LOVETS_NOTICE_URL: 'http://carbonstealth.eu/privacy' },
    { LOVETS_UNSUB_KEY: Buffer.alloc(16, 1).toString('base64') },
    { LOVETS_RETENTION_MONTHS: '24' },
  ]) {
    assert.throws(() => loadConfig({ ...BASE, ...extra }), JSON.stringify(extra));
  }
});
