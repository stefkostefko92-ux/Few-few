// The painted icons: every name the Icon component accepts has its two WebP files in public/icons, of the size their
// name says, and no file there is left without a name (scripts/icons-build.py keeps the two in step).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ICON_NAMES } from '@/components/icon-names';

const DIR = path.join(process.cwd(), 'public', 'icons');
const SIZES = [48, 96] as const;

/** Width and height of a WebP file from its header (VP8, VP8L and VP8X chunks). */
function webpSize(file: string): [number, number] {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', file);
  assert.equal(b.toString('ascii', 8, 12), 'WEBP', file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  assert.equal(kind, 'VP8 ', file);
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

test('every icon name has its 48 and 96 px WebP files', () => {
  assert.ok(ICON_NAMES.length >= 180, `only ${ICON_NAMES.length} icons`);
  for (const name of ICON_NAMES) {
    for (const s of SIZES) {
      const f = path.join(DIR, `${name}-${s}.webp`);
      assert.ok(existsSync(f), `missing public/icons/${name}-${s}.webp`);
      assert.deepEqual(webpSize(f), [s, s], `${name}-${s}.webp`);
    }
  }
});

test('the names are unique, in kebab-case, and cover every file', () => {
  assert.equal(new Set(ICON_NAMES).size, ICON_NAMES.length);
  for (const n of ICON_NAMES) assert.match(n, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const named = new Set(ICON_NAMES.flatMap((n) => SIZES.map((s) => `${n}-${s}.webp`)));
  for (const f of readdirSync(DIR)) assert.ok(named.has(f), `public/icons/${f} has no name in icon-names.ts`);
});
