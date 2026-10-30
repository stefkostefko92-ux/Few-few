// The client of the sketches' model (round 50, src/server/schizzi/model.ts), made once per configuration: the project,
// the region, the key file and the key itself — its time, size and inode (src/server/schizzi/config.ts) —, so that a key
// replaced at the same path makes a new client without a restart; a key the API refuses ('unavailable': 401/403/404)
// drops the client, and the next reading makes it again from the key in place then. A fake factory: no network.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SketchConfig } from '../schizzi/config';
import type { SketchAnswer, SketchModel, SketchRequest } from '../schizzi/model';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const KEY_DIR = mkdtempSync(path.join(os.tmpdir(), 'vertex-model-test-'));
const KEY = path.join(KEY_DIR, 'service-account.json');
writeFileSync(KEY, '{"type":"service_account","n":0}', { mode: 0o600 });
process.env.DATABASE_URL ??= 'postgresql://model-test/none';
process.env.AUTH_SECRET ??= 'model-test-secret-that-is-long-enough';
process.env.VERTEX_PROJECT_ID = 'liftpilot-test';
process.env.VERTEX_REGION = 'eu';
process.env.VERTEX_CREDENTIALS_FILE = KEY;
mock.module(src('lib/log.ts'), { namedExports: { log: { info: () => undefined, warn: () => undefined, error: () => undefined } } });

const { sketchState } = await import('../schizzi/config');
const { SketchModelError, sketchModel } = await import('../schizzi/model');

function config(): SketchConfig {
  const s = sketchState();
  if (!s.on) return assert.fail(`the feature is off: ${s.reason}`);
  return s.config;
}

const made: SketchConfig[] = [];
let failure: Error | null = null;
const OK: SketchAnswer = { kind: 'ok', text: '{}', model: 'claude-opus-5-5' };
const factory = async (cfg: SketchConfig): Promise<SketchModel> => {
  made.push(cfg);
  return { read: async () => { if (failure) throw failure; return OK; } };
};
const REQ: SketchRequest = { model: 'claude-opus-5-5', system: '', images: [], instruction: '', schema: {} };
const read = (m: SketchModel) => m.read(REQ, new AbortController().signal);

test('config: la chiave è riconosciuta dal suo file — tempo, dimensione e inode — a ogni lettura', () => {
  const a = config();
  assert.deepEqual(config(), a, 'the same file: the same configuration');
  assert.ok(a.key.size > 0 && a.key.ino > 0 && a.key.mtimeMs > 0);
  writeFileSync(KEY, '{"type":"service_account","n":10}', { mode: 0o600 });
  const b = config();
  assert.notDeepEqual(b.key, a.key, 'rewritten in place');
  // the usual rotation: a new file moved over the old one (another inode, the same size)
  const next = path.join(KEY_DIR, 'next.json');
  writeFileSync(next, '{"type":"service_account","n":11}', { mode: 0o600 });
  renameSync(next, KEY);
  const c = config();
  assert.equal(c.key.size, b.key.size);
  assert.notEqual(c.key.ino, b.key.ino);
  assert.equal(c.credentialsFile, a.credentialsFile);
});

test('modello: un client per configurazione e per chiave; una chiave rifiutata lo dimentica', async () => {
  made.length = 0;
  failure = null;
  const cfg = config();
  const m1 = await sketchModel(cfg, factory);
  assert.equal(await sketchModel({ ...cfg, key: { ...cfg.key } }, factory), m1, 'the same configuration: the same client');
  assert.equal(made.length, 1);
  // the key replaced at the same path (time, size or inode): a new client, no restart
  for (const k of ['mtimeMs', 'size', 'ino'] as const) {
    assert.notEqual(await sketchModel({ ...cfg, key: { ...cfg.key, [k]: cfg.key[k] + 1 } }, factory), m1, k);
  }
  assert.equal(made.length, 4);
  // the API busy or failing: the client stays
  const now = { ...cfg, key: { ...cfg.key, size: cfg.key.size + 7 } };
  const m = await sketchModel(now, factory);
  assert.equal(made.length, 5);
  for (const e of [new SketchModelError('busy', 429), new SketchModelError('failed', 500), new Error('network')]) {
    failure = e;
    await assert.rejects(read(m));
    assert.equal(await sketchModel(now, factory), m, e.message);
  }
  // the key refused (revoked, its account disabled): forgotten, the next reading makes the client again
  failure = new SketchModelError('unavailable', 403);
  await assert.rejects(read(m), (e: unknown) => e instanceof SketchModelError && e.kind === 'unavailable');
  failure = null;
  const again = await sketchModel(now, factory);
  assert.notEqual(again, m);
  assert.equal(made.length, 6);
  assert.deepEqual(await read(again), OK);
  // an old client refused after a newer one was made: the newer one stays
  failure = new SketchModelError('unavailable', 401);
  await assert.rejects(read(m));
  failure = null;
  assert.equal(await sketchModel(now, factory), again);
  assert.equal(made.length, 6);
});
