import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadConfig, loadWorkerConfig, redisEnabled } from '../src/config.js';

/**
 * Средата на опашките (NFR-06): REDIS_URL е redis://…/rediss://… или празно (всичко в процеса);
 * worker-ът иска Redis и хранилището, но НЕ получава ключовете на потребителските сесии (least
 * privilege); OCR езиците и таваните се проверяват при старт (fail-closed).
 */

const KEK = Buffer.alloc(32, 1).toString('base64');
const app = {
  PUBLIC_BASE_URL: 'https://chatchat.test',
  DATABASE_URL: 'postgresql://x',
  SESSION_PEPPER: 'p'.repeat(40),
  MFA_ENC_KEY: Buffer.alloc(32, 2).toString('base64'),
};
const worker = {
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://:secret@redis:6379',
  ATTACHMENTS_DIR: '/data/attachments',
  FILES_KEK: KEK,
};

describe('опашките в средата', () => {
  test('без REDIS_URL — в процеса; с адрес — Redis; празен низ = „не е зададено“', () => {
    assert.equal(redisEnabled(loadConfig({ ...app })), false);
    assert.equal(redisEnabled(loadConfig({ ...app, REDIS_URL: '' })), false);
    const cfg = loadConfig({ ...app, REDIS_URL: 'rediss://:p@cache.internal:6380/2' });
    assert.equal(redisEnabled(cfg), true);
    assert.deepEqual(
      [cfg.OCR_LANGS, cfg.OCR_ENGINE, cfg.INGEST_CONCURRENCY, cfg.QUEUE_ATTEMPTS],
      ['ita+eng+bul', 'tesseract', 2, 3],
    );
  });

  test('невалиден REDIS_URL или OCR_LANGS → процесът не тръгва (и адресът не се печата)', () => {
    for (const bad of ['http://:TAINA-1@redis', 'redis://:TAINA-1@', 'не е адрес TAINA-1']) {
      assert.throws(
        () => loadConfig({ ...app, REDIS_URL: bad }),
        (e: unknown) =>
          e instanceof Error && /REDIS_URL/.test(e.message) && !e.message.includes('TAINA-1'),
      );
    }
    assert.throws(() => loadConfig({ ...app, OCR_LANGS: 'ita; rm -rf /' }), /OCR_LANGS/);
  });

  test('worker: иска REDIS_URL и ATTACHMENTS_DIR; ключовете на сесиите и MFA не му трябват', () => {
    const cfg = loadWorkerConfig(worker);
    assert.equal(cfg.REDIS_URL, worker.REDIS_URL);
    assert.equal('SESSION_PEPPER' in cfg, false);
    assert.equal('MFA_ENC_KEY' in cfg, false);
    assert.throws(() => loadWorkerConfig({ ...worker, REDIS_URL: '' }), /REDIS_URL/);
    assert.throws(() => loadWorkerConfig({ ...worker, ATTACHMENTS_DIR: '' }), /ATTACHMENTS_DIR/);
    assert.throws(() => loadWorkerConfig({ ...worker, FILES_KEK: '' }), /FILES_KEK/);
  });
});
