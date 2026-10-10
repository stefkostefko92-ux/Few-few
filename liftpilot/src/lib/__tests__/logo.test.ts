// The logo's checks at upload (src/lib/logo.ts): a file the renderers would fail on never becomes a logo — an issued
// drawing set keeps its logo bytes for good, so a damaged one made it undownloadable (red team, 2026-10-06).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLogo } from '../logo';

// a 16 × 16 baseline JPEG and PNG made with Pillow
const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDMooor0ThP/9k=', 'base64'));
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGOUi1rAQApgIkn1qIZRDUNKAwCLCwE4rlyIiAAAAABJRU5ErkJggg==', 'base64'));
const SOS = (b: Uint8Array): number => b.findIndex((x, i) => x === 0xff && b[i + 1] === 0xda);
const splice = (b: Uint8Array, at: number, add: readonly number[], drop = 0): Uint8Array => Uint8Array.from([...b.slice(0, at), ...add, ...b.slice(at + drop)]);
// a second frame header (SOF0, 12000 × 12000, one component)
const SOF0 = [0xff, 0xc0, 0x00, 0x0b, 0x08, 0x2e, 0xe0, 0x2e, 0xe0, 0x01, 0x01, 0x11, 0x00];

test('a whole PNG and JPEG are logos', () => {
  assert.deepEqual(readLogo(JPEG), { mime: 'image/jpeg', width: 16, height: 16 });
  assert.deepEqual(readLogo(PNG), { mime: 'image/png', width: 16, height: 16 });
});

test('a file cut short is not a logo', () => {
  assert.equal(readLogo(JPEG.slice(0, JPEG.length - 40)), null);
  assert.equal(readLogo(PNG.slice(0, PNG.length - 12)), null);
});

test('a second frame header, before or inside the coded data, is not a logo', () => {
  assert.equal(readLogo(splice(JPEG, SOS(JPEG), SOF0)), null);
  const data = SOS(JPEG) + 2 + ((JPEG[SOS(JPEG) + 2] << 8) | JPEG[SOS(JPEG) + 3]);
  assert.equal(readLogo(splice(JPEG, data + 4, [0xff, 0xc2])), null);
});
