// The worker has 1 GB (docker-compose.yml): a file that needs more to decode takes it down, and the
// queue of every company stands while it restarts (audit, 4 November 2026, measured with sharp 0.35 and
// the system ffmpeg on 4 cores):
// - a progressive JPEG is decoded whole (no shrink-on-load): 208 Mpx in 2.4 MB → 1.3 GB;
// - AVIF is decoded whole too: 60 Mpx in a 1.7 KB file → 1.1 GB;
// - an 8K clip decoded on every core of the host → 1 GB; one decoding thread → 0.6 GB.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { comprimiFoto, FotoTroppoGrande, limitePixel } from '../src/allegati/foto.js';
import { argomentiVideo, type InfoVideo } from '../src/allegati/video.js';

let dir = '';
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rilievi-limiti-'));
});
after(() => rm(dir, { recursive: true, force: true }));

/** A small progressive JPEG whose header says it is `width` × `height` — nothing is decoded before the check. */
async function progressiveClaiming(width: number, height: number): Promise<Buffer> {
  const jpeg = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#808080' },
  })
    .jpeg({ progressive: true })
    .toBuffer();
  const sof2 = jpeg.indexOf(Buffer.from([0xff, 0xc2]));
  assert.ok(sof2 > 0, 'a progressive frame');
  jpeg.writeUInt16BE(height, sof2 + 5);
  jpeg.writeUInt16BE(width, sof2 + 7);
  return jpeg;
}

describe('the photos the worker accepts', () => {
  it('keeps what a phone takes, refuses what would not fit in its memory', () => {
    // Baseline JPEG is decoded already shrunk: even 200 Mpx stays small.
    assert.equal(limitePixel('jpeg', false), 220_000_000);
    assert.equal(limitePixel('webp', false), 220_000_000);
    // Progressive JPEG and AVIF are decoded whole: ~6 and ~19 bytes a pixel.
    assert.equal(limitePixel('jpeg', true), 50_000_000);
    assert.equal(limitePixel('avif', false), 30_000_000);
    assert.equal(limitePixel('png', false), 60_000_000);
  });

  it('refuses a progressive JPEG over its limit before decoding it', async () => {
    const source = join(dir, 'progressive.jpg');
    await writeFile(source, await progressiveClaiming(8000, 8000));
    const out = (n: string) => ({
      file: join(dir, `${n}.jpg`),
      mini: join(dir, `${n}.mini.jpg`),
      riquadro: join(dir, `${n}.riquadro.jpg`),
    });
    await assert.rejects(comprimiFoto(source, 'jpeg', out('big')), FotoTroppoGrande);
  });

  it('compresses a progressive photo of a phone as before', async () => {
    const source = join(dir, 'phone-progressive.jpg');
    await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#406080' } })
      .jpeg({ progressive: true })
      .toFile(source);
    const result = await comprimiFoto(source, 'jpeg', {
      file: join(dir, 'p.jpg'),
      mini: join(dir, 'p.mini.jpg'),
      riquadro: join(dir, 'p.riquadro.jpg'),
    });
    assert.deepEqual([result.larghezza, result.altezza], [2560, 1920]);
  });
});

const info = (): InfoVideo => ({
  durataMs: 10_000,
  larghezza: 7680,
  altezza: 4320,
  hdr: false,
  audio: true,
});

describe('the clips the worker compresses', () => {
  it('decodes on one thread, whatever cores the host shows', () => {
    const args = argomentiVideo(info(), 'mp4', '/m/a.orig', '/m/a.part', true, 600);
    const input = args.indexOf('-i');
    const decoder = args.indexOf('-threads');
    assert.ok(decoder >= 0 && decoder < input, '-threads before -i is for the decoder');
    assert.equal(args[decoder + 1], '1');
    assert.equal(args[args.indexOf('-filter_threads') + 1], '1');
    // The encoder keeps its two threads (after the input).
    assert.equal(args[args.lastIndexOf('-threads') + 1], '2');
    assert.ok(args.lastIndexOf('-threads') > input);
  });
});
