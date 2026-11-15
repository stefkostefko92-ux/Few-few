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
    ANTHROPIC_API_KEY: '',
    IG_WEBHOOK_VERIFY_TOKEN: '',
    REPLY_PRIVACY_URL: '',
    PRIVATE_REPLIES_PER_HOUR: '',
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.ANTHROPIC_API_KEY, undefined);
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
