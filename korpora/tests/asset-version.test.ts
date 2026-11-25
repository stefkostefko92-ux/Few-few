import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetVersion } from '../src/http/asset-version.js';

test('a new picture or icon changes the version of the static files (ops:A2)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'korpora-assets-'));
  try {
    mkdirSync(join(dir, 'img', 'story'), { recursive: true });
    writeFileSync(join(dir, 'site.css'), 'body{}');
    let previous = assetVersion(dir);
    assert.match(previous, /^[0-9a-f]{10}$/);
    for (const file of [
      'img/story/step-1-1120.webp',
      'img/brand/logo.png',
      'img/icon-192.png',
      'img/favicon.ico',
      'img/og.jpg',
      'img/photo.avif',
    ]) {
      mkdirSync(join(dir, file, '..'), { recursive: true });
      writeFileSync(join(dir, file), file);
      const next = assetVersion(dir);
      assert.notEqual(next, previous, `${file} did not change the version`);
      previous = next;
    }
    // a file the pages never point to with ?v= does not move it
    writeFileSync(join(dir, 'notes.txt'), 'x');
    assert.equal(assetVersion(dir), previous);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
