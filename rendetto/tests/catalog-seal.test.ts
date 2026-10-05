import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSealedCatalog, SEALED_CATALOG, sealCatalog } from '../src/services/catalog-seal.js';
import { shopCatalogText } from '../src/services/engine.js';
import { fromRoot } from '../src/paths.js';

const KEY = randomBytes(32).toString('hex');
const JSON_TEXT = JSON.stringify({
  handles: [{ name: 'Дръжка „Горчица“', price: 1234, shop: 'example' }],
});

const fails = (fn: () => unknown, reason: RegExp) =>
  assert.throws(fn, (error: unknown) => error instanceof Error && reason.test(error.message));

test('a sealed catalog opens to the same text, and only with its key', () => {
  const sealed = sealCatalog(JSON_TEXT, KEY);
  assert.equal(openSealedCatalog(sealed, KEY), JSON_TEXT);
  assert.equal(sealed.subarray(0, 4).toString('ascii'), 'RDC1');
  assert.ok(!sealed.includes(Buffer.from('Горчица')), 'no plain text in the sealed bytes');
  assert.ok(!sealCatalog(JSON_TEXT, KEY).equals(sealed), 'a fresh IV every time');
  fails(() => openSealedCatalog(sealed, randomBytes(32).toString('hex')), /грешен CATALOG_KEY/);
  fails(() => openSealedCatalog(sealed, 'ab'.repeat(16)), /32 байта/);
});

test('any changed byte — prefix, IV, tag or body — or a cut file is refused, never read as empty', () => {
  const sealed = sealCatalog(JSON_TEXT, KEY);
  for (const at of [0, 4, 4 + 12, sealed.length - 1]) {
    const bad = Buffer.from(sealed);
    bad[at] = (bad[at] ?? 0) ^ 0x01;
    fails(() => openSealedCatalog(bad, KEY), at === 0 ? /непознат формат/ : /не се разшифрова/);
  }
  fails(() => openSealedCatalog(sealed.subarray(0, 32), KEY), /непознат формат/);
  fails(() => openSealedCatalog(Buffer.from(JSON_TEXT), KEY), /непознат формат/);
});

test('with a key the sealed catalog from the repo wins; without one the server file, else none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rendetto-catalog-'));
  try {
    const plainFile = join(dir, 'catalog.json');
    const sealedFile = join(dir, 'catalog.json.enc');
    writeFileSync(plainFile, '{"from":"file"}');
    writeFileSync(sealedFile, sealCatalog('{"from":"sealed"}', KEY));
    assert.deepEqual(shopCatalogText({ plainFile, sealedFile, key: KEY }), {
      text: '{"from":"sealed"}',
      source: 'sealed',
    });
    assert.deepEqual(shopCatalogText({ plainFile, sealedFile, key: undefined }), {
      text: '{"from":"file"}',
      source: 'file',
    });
    rmSync(plainFile);
    assert.equal(shopCatalogText({ plainFile, sealedFile, key: undefined }), null);
    rmSync(sealedFile);
    fails(() => shopCatalogText({ plainFile, sealedFile, key: KEY }), /CATALOG_KEY е зададен/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the catalog in the repo is sealed: no shop data in plain text', () => {
  const sealed = readFileSync(fromRoot(SEALED_CATALOG));
  assert.equal(sealed.subarray(0, 4).toString('ascii'), 'RDC1');
  for (const plain of ['"handles"', '"price"', 'http']) {
    assert.ok(!sealed.includes(Buffer.from(plain)), `${plain} in the sealed file`);
  }
});
