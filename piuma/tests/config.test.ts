import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

const base = {
  PUBLIC_BASE_URL: 'https://piuma.example.com',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db',
  REDIS_URL: 'redis://127.0.0.1:6379/3',
  IG_APP_ID: '123456',
  IG_APP_SECRET: 'app-secret',
  IG_REDIRECT_URI: 'https://piuma.example.com/auth/instagram/callback',
  TOKEN_ENC_KEY: 'a'.repeat(64),
  AUDIT_ANCHOR_DIR: '/var/lib/piuma/audit',
};

/* Регресия (ревю, 2026-11-15): без котва цялата v2 опашка се подменя с v1 записи без ключ, а
   каноничният docker деплой тръгваше без котва. В продукция котвата е задължителна. */
test('в продукция без AUDIT_ANCHOR_DIR процесът не тръгва', () => {
  const { AUDIT_ANCHOR_DIR: _dir, ...withoutAnchor } = base;
  assert.throws(
    () => loadConfig({ ...withoutAnchor, NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    /AUDIT_ANCHOR_DIR/,
  );
  assert.equal(
    loadConfig({ ...withoutAnchor, NODE_ENV: 'test' } as NodeJS.ProcessEnv).AUDIT_ANCHOR_DIR,
    undefined,
  );
  const cfg = loadConfig({ ...base, AUDIT_V1_MAX_ID: '41' } as NodeJS.ProcessEnv);
  assert.equal(cfg.AUDIT_V1_MAX_ID, 41);
  assert.throws(
    () => loadConfig({ ...base, AUDIT_V1_MAX_ID: '-1' } as NodeJS.ProcessEnv),
    /AUDIT_V1_MAX_ID/,
  );
});

/**
 * Compose подава незадължителните като `${X:-}` — празен низ, не липса. Без това правило
 * zod отказваше `''` и процесът не тръгваше, въпреки че ключът е „по избор“.
 */
test('празна променлива от Compose е липсваща, не невалидна', () => {
  const cfg = loadConfig({
    ...base,
    VERTEX_PROJECT_ID: '',
    GOOGLE_APPLICATION_CREDENTIALS: '',
    IG_WEBHOOK_VERIFY_TOKEN: '',
    REPLY_PRIVACY_URL: '',
    PRIVATE_REPLIES_PER_HOUR: '',
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.VERTEX_PROJECT_ID, undefined);
  assert.equal(cfg.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(cfg.IG_WEBHOOK_VERIFY_TOKEN, undefined);
  assert.equal(cfg.REPLY_PRIVACY_URL, undefined);
  assert.equal(cfg.PRIVATE_REPLIES_PER_HOUR, 60);
  assert.equal(cfg.PRIVATE_REPLIES_RETENTION_DAYS, 9);
  assert.equal(cfg.REPLY_CONTACT_EMAIL, 'info@carbonstealth.eu');
});

test('задължителната остава задължителна, дори да е празен низ', () => {
  assert.throws(
    () => loadConfig({ ...base, IG_APP_SECRET: '' } as NodeJS.ProcessEnv),
    /IG_APP_SECRET/,
  );
});

test('срокът на съхранение не пада под 9 дни — иначе повторна доставка праща второ', () => {
  assert.throws(
    () => loadConfig({ ...base, PRIVATE_REPLIES_RETENTION_DAYS: '8' } as NodeJS.ProcessEnv),
    /PRIVATE_REPLIES_RETENTION_DAYS/,
  );
  assert.equal(
    loadConfig({ ...base, PRIVATE_REPLIES_RETENTION_DAYS: '30' } as NodeJS.ProcessEnv)
      .PRIVATE_REPLIES_RETENTION_DAYS,
    30,
  );
});

test('слаб verify token не се приема', () => {
  assert.throws(
    () => loadConfig({ ...base, IG_WEBHOOK_VERIFY_TOKEN: 'short' } as NodeJS.ProcessEnv),
    /IG_WEBHOOK_VERIFY_TOKEN/,
  );
});

/* Claude е само през Google Cloud Vertex AI на мулти-региона `eu`: първостепенният API няма
   обработка в ЕС, а единичните региони не дават Opus 5/5.5. Друг регион = процесът не тръгва. */
test('Vertex регионът по подразбиране е „eu“, а моделът е конфигурируем', () => {
  const cfg = loadConfig(base as NodeJS.ProcessEnv);
  assert.equal(cfg.VERTEX_REGION, 'eu');
  assert.equal(cfg.VERTEX_MODEL, 'claude-opus-5-5');
  assert.equal(cfg.VERTEX_PROJECT_ID, undefined);
  assert.equal(
    loadConfig({ ...base, VERTEX_MODEL: 'claude-opus-5' } as NodeJS.ProcessEnv).VERTEX_MODEL,
    'claude-opus-5',
  );
});

test('регион извън ЕС мулти-региона не се приема (fail-closed)', () => {
  // europe-west2 е Лондон, europe-west6 — Цюрих: „europe-“ не значи ЕС.
  for (const region of ['global', 'us', 'us-east5', 'europe-west1', 'europe-west2', 'EU']) {
    assert.throws(
      () => loadConfig({ ...base, VERTEX_REGION: region } as NodeJS.ProcessEnv),
      /VERTEX_REGION/,
      region,
    );
  }
});

test('Vertex проектът и пътят до удостоверенията се валидират на входа', () => {
  assert.throws(
    () => loadConfig({ ...base, VERTEX_PROJECT_ID: 'Bad Project' } as NodeJS.ProcessEnv),
    /VERTEX_PROJECT_ID/,
  );
  assert.throws(
    () => loadConfig({ ...base, GOOGLE_APPLICATION_CREDENTIALS: 'sa.json' } as NodeJS.ProcessEnv),
    /GOOGLE_APPLICATION_CREDENTIALS/,
  );
  assert.throws(
    () => loadConfig({ ...base, VERTEX_MODEL: 'gpt-5; rm -rf' } as NodeJS.ProcessEnv),
    /VERTEX_MODEL/,
  );
  const cfg = loadConfig({
    ...base,
    VERTEX_PROJECT_ID: 'piuma-eu-123',
    GOOGLE_APPLICATION_CREDENTIALS: '/run/secrets/vertex-sa.json',
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.VERTEX_PROJECT_ID, 'piuma-eu-123');
});
