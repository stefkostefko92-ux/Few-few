// Настройките: Vertex само в ЕС (иначе не стартира), тайните на webhook-а — поне 32 знака, срокът 30–365.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const fake = (label: string): string => ['t', label, 'z'.repeat(40)].join('-');
const BASE = {
  JWT_SECRET: fake('jwt'),
  TOTP_KEY: Buffer.alloc(32, 3).toString('base64'),
  DATA_KEY: Buffer.alloc(32, 4).toString('base64'),
  APP_ORIGIN: 'https://otgovorko.example',
  INBOUND_PATH: 'a'.repeat(40),
  INBOUND_TOKEN: 'b'.repeat(40),
};

test('подразбиране: eu, Sonnet 5.5, 180 дни, без Vertex проект → без чернови', () => {
  const c = loadConfig({ ...BASE, VERTEX_PROJECT_ID: '', RETENTION_DAYS: '' });
  assert.equal(c.vertexRegion, 'eu');
  assert.equal(c.draftModel, 'claude-sonnet-5-5');
  assert.equal(c.retentionDays, 180);
  assert.equal(c.vertexProjectId, null);
  assert.equal(c.httpPort, 4380);
  assert.match(c.leakCanary, /^CS[0-9A-F]{16}$/);
});

test('регион извън ЕС (Лондон, Цюрих, САЩ, global) → не стартира', () => {
  for (const r of ['europe-west2', 'europe-west6', 'us-east5', 'global']) {
    assert.throws(() => loadConfig({ ...BASE, VERTEX_REGION: r }), r);
  }
  assert.equal(loadConfig({ ...BASE, VERTEX_REGION: 'europe-west8' }).vertexRegion, 'europe-west8');
});

test('къса или с непозволени знаци тайна на webhook-а, срок извън 30–365, непознат модел → не стартира', () => {
  for (const extra of [
    { INBOUND_PATH: 'kratko' },
    { INBOUND_TOKEN: 'x'.repeat(31) },
    { INBOUND_PATH: 'a'.repeat(39) + '/' },
    { RETENTION_DAYS: '10' },
    { RETENTION_DAYS: '400' },
    { DRAFT_MODEL: 'gpt-5' },
    { DATA_KEY: Buffer.alloc(16).toString('base64') },
  ]) {
    assert.throws(() => loadConfig({ ...BASE, ...extra }), JSON.stringify(extra));
  }
});
