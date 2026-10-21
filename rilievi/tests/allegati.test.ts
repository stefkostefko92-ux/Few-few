import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { riconosci } from '../src/allegati/formati.js';
import { comprimiFoto, LATO_FOTO, LATO_MINI, RIQUADRO } from '../src/allegati/foto.js';
import { didascaliaSchema, modificheDi, nomeSicuro } from '../src/allegati/service.js';
import type { AllegatoVista } from '../src/allegati/service.js';
import { fotoPerStampa, gruppiScelta, nelFoglioDi } from '../src/allegati/stampa.js';
import {
  argomentiProbe,
  argomentiVideo,
  leggiProbe,
  type InfoVideo,
} from '../src/allegati/video.js';
import { loadMediaConfig } from '../src/config.js';
import { fotoFromBody, fotoInStampaDi } from '../src/schede/stampa.js';

const ftyp = (brand: string) =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftyp'),
    Buffer.from(brand),
    Buffer.alloc(12),
  ]);
const riff = (kind: string) =>
  Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from(kind), Buffer.alloc(8)]);

describe('what an upload is', () => {
  it('is recognised by its bytes: photos, videos, HEIC apart, audio and the rest refused', () => {
    assert.deepEqual(riconosci(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(12)])), {
      tipo: 'FOTO',
      formato: 'jpeg',
    });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(8)]);
    assert.deepEqual(riconosci(png), { tipo: 'FOTO', formato: 'png' });
    assert.deepEqual(riconosci(riff('WEBP')), { tipo: 'FOTO', formato: 'webp' });
    assert.deepEqual(riconosci(riff('AVI ')), { tipo: 'VIDEO', formato: 'avi' });
    assert.equal(riconosci(riff('WAVE')), null);
    const ebml = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.alloc(12)]);
    assert.deepEqual(riconosci(ebml), { tipo: 'VIDEO', formato: 'webm' });
    assert.deepEqual(riconosci(ftyp('isom')), { tipo: 'VIDEO', formato: 'mp4' });
    assert.deepEqual(riconosci(ftyp('qt  ')), { tipo: 'VIDEO', formato: 'mov' });
    assert.deepEqual(riconosci(ftyp('3gp5')), { tipo: 'VIDEO', formato: '3gp' });
    assert.deepEqual(riconosci(ftyp('avif')), { tipo: 'FOTO', formato: 'avif' });
    assert.deepEqual(riconosci(ftyp('heic')), { tipo: 'HEIC' });
    assert.deepEqual(riconosci(ftyp('mif1')), { tipo: 'HEIC' });
    assert.equal(riconosci(ftyp('M4A ')), null);
    assert.equal(riconosci(Buffer.from('GIF89a' + ' '.repeat(10))), null);
    assert.equal(riconosci(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')), null);
    assert.equal(riconosci(Buffer.from([0xff, 0xd8, 0xff])), null, 'too short to say');
  });
});

describe('the photo compression', () => {
  let dir = '';
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rilievi-foto-'));
  });
  after(() => rm(dir, { recursive: true, force: true }));
  const outputs = (name: string) => ({
    file: join(dir, `${name}.jpg`),
    mini: join(dir, `${name}.mini.jpg`),
    riquadro: join(dir, `${name}.riquadro.jpg`),
  });

  it('turns the phone photo upright and drops EXIF with the GPS position and the phone model', async () => {
    const source = join(dir, 'phone.orig');
    await sharp({ create: { width: 400, height: 300, channels: 3, background: '#2050c0' } })
      .withExif({
        IFD0: { Make: 'TestPhone', Model: 'Model 9' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '45/1 28/1 0/1' },
      })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toFile(source);
    const before = await sharp(source).metadata();
    assert.equal(before.orientation, 6);
    assert.ok(before.exif, 'the test photo carries EXIF');

    const result = await comprimiFoto(source, 'jpeg', outputs('phone'));
    assert.deepEqual([result.larghezza, result.altezza], [300, 400], 'rotated by the EXIF tag');
    const out = await sharp(join(dir, 'phone.jpg')).metadata();
    assert.equal(out.format, 'jpeg');
    assert.equal(out.exif, undefined, 'no EXIF (GPS, phone) in what is kept');
    assert.equal(out.orientation, undefined);
    const mini = await sharp(join(dir, 'phone.mini.jpg')).metadata();
    assert.deepEqual([mini.width, mini.height], [300, 400], 'never enlarged');
    const tile = await sharp(join(dir, 'phone.riquadro.jpg')).metadata();
    assert.deepEqual([tile.width, tile.height], [300, 400], 'the tile is never enlarged either');
    assert.equal(tile.exif, undefined);
  });

  it('shrinks a big photo to 2560 px, its thumbnail to 960 px and its tile to the box; transparency goes on white', async () => {
    const source = join(dir, 'big.orig');
    await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(source);
    const result = await comprimiFoto(source, 'png', outputs('big'));
    assert.deepEqual([result.larghezza, result.altezza], [LATO_FOTO, 1920]);
    const mini = await sharp(join(dir, 'big.mini.jpg')).metadata();
    assert.deepEqual([mini.width, mini.height], [LATO_MINI, 720]);
    // 4:3 like the gallery's box: the box itself (the height decides: 368 / 1920 × 2560 = 490.7).
    const tile = await sharp(join(dir, 'big.riquadro.jpg')).metadata();
    assert.deepEqual([tile.width, tile.height], [RIQUADRO.width + 1, RIQUADRO.height]);
    const { data } = await sharp(join(dir, 'big.jpg')).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[0]! > 240 && data[1]! > 240 && data[2]! > 240, 'transparent becomes white');
  });

  it('refuses bytes that are not the kind they claim to be', async () => {
    const source = join(dir, 'fake.orig');
    await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } })
      .png()
      .toFile(source);
    await assert.rejects(comprimiFoto(source, 'jpeg', outputs('f')));
  });

  it('makes the tile cover the gallery box whatever the shape: a portrait by its width, a wide one by its height', async () => {
    for (const [name, width, height, expected] of [
      ['portrait', 3024, 4032, [RIQUADRO.width, 653]],
      ['wide', 3840, 2160, [654, RIQUADRO.height]],
    ] as const) {
      const source = join(dir, `${name}.orig`);
      await sharp({ create: { width, height, channels: 3, background: '#808080' } })
        .jpeg()
        .toFile(source);
      await comprimiFoto(source, 'jpeg', outputs(name));
      const tile = await sharp(join(dir, `${name}.riquadro.jpg`)).metadata();
      assert.deepEqual([tile.width, tile.height], expected, name);
    }
  });
});

const info = (over: Partial<InfoVideo> = {}): InfoVideo => ({
  larghezza: 3840,
  altezza: 2160,
  durataMs: 12_000,
  audio: true,
  hdr: false,
  ...over,
});
const valueAfter = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('the video compression', () => {
  it('reads only the file, with the container it was recognised as, never a playlist', () => {
    const args = argomentiVideo(info(), 'mov', '/m/a.orig', '/m/a.part', true, 600);
    const input = args.indexOf('-i');
    assert.equal(valueAfter(args, '-protocol_whitelist'), 'file');
    assert.ok(args.indexOf('-protocol_whitelist') < input);
    assert.equal(args[input - 2], '-f');
    assert.equal(args[input - 1], 'mov');
    assert.equal(args[input + 1], '/m/a.orig');
    assert.equal(
      valueAfter(argomentiVideo(info(), 'webm', 's', 'u', false, 600), '-f'),
      'matroska',
    );
    assert.equal(valueAfter(argomentiVideo(info(), 'avi', 's', 'u', false, 600), '-f'), 'avi');
    assert.equal(valueAfter(argomentiProbe('/m/a.orig', '3gp'), '-f'), 'mov');
    assert.equal(valueAfter(argomentiProbe('/m/a.orig', 'webm'), '-protocol_whitelist'), 'file');
  });

  it('makes H.264 up to 1080p and 30 fps, AAC sound, no metadata, ready to play while loading', () => {
    const args = argomentiVideo(info(), 'mp4', 's', '/m/out.mp4', true, 600);
    const filters = valueAfter(args, '-vf')!;
    assert.match(filters, /min\(iw,1920\)/);
    assert.match(filters, /min\(ih,1080\)/);
    assert.match(filters, /force_original_aspect_ratio=decrease/);
    assert.match(filters, /format=yuv420p$/);
    assert.equal(valueAfter(args, '-fpsmax'), '30');
    assert.equal(valueAfter(args, '-c:v'), 'libx264');
    assert.equal(valueAfter(args, '-crf'), '27');
    assert.equal(valueAfter(args, '-c:a'), 'aac');
    assert.equal(valueAfter(args, '-map_metadata'), '-1');
    assert.equal(valueAfter(args, '-movflags'), '+faststart');
    // The cap holds even when the container does not say how long the clip is.
    assert.equal(valueAfter(args, '-t'), '600');
    assert.ok(args.indexOf('-t') > args.indexOf('-i'), '-t limits the output, after the input');
    assert.equal(args.at(-1), '/m/out.mp4');
    assert.doesNotMatch(filters, /tonemap/, 'SDR stays as it is');
  });

  it('turns HDR from a phone into SDR when ffmpeg can, and leaves it alone when it cannot', () => {
    const hdr = info({ hdr: true });
    assert.match(
      valueAfter(argomentiVideo(hdr, 'mov', 's', 'u', true, 600), '-vf')!,
      /tonemap=tonemap=hable/,
    );
    assert.doesNotMatch(
      valueAfter(argomentiVideo(hdr, 'mov', 's', 'u', false, 600), '-vf')!,
      /tonemap/,
    );
  });

  it('trusts only what it checked in the ffprobe answer', () => {
    assert.deepEqual(
      leggiProbe({
        streams: [
          { codec_type: 'video', width: 3840, height: 2160, color_transfer: 'arib-std-b67' },
          { codec_type: 'audio' },
        ],
        format: { duration: '12.345' },
      }),
      { larghezza: 3840, altezza: 2160, durataMs: 12_345, audio: true, hdr: true },
    );
    assert.equal(leggiProbe({ streams: [{ codec_type: 'audio' }], format: {} }), null);
    assert.equal(leggiProbe({ streams: [{ codec_type: 'video', width: 0, height: 0 }] }), null);
    assert.equal(leggiProbe('not json'), null);
    assert.equal(
      leggiProbe({
        streams: [{ codec_type: 'video', width: 10, height: 10 }],
        format: { duration: 'N/A' },
      })?.durataMs,
      0,
    );
  });
});

describe('the media settings', () => {
  it('make a relative folder absolute (files are only served from an absolute path)', () => {
    const cfg = loadMediaConfig({ MEDIA_DIR: './media' });
    assert.ok(isAbsolute(cfg.MEDIA_DIR));
    assert.equal(cfg.MEDIA_DIR, join(process.cwd(), 'media'));
    assert.equal(loadMediaConfig({}).MEDIA_DIR, '/data/media');
  });
});

describe('captions and names', () => {
  it('cleans a caption: no control characters, single spaces, at most 200 characters', () => {
    assert.equal(
      didascaliaSchema.parse(' Quadro,\u0007  lato\n sinistro '),
      'Quadro, lato sinistro',
    );
    assert.equal(didascaliaSchema.parse('   '), null);
    assert.equal(didascaliaSchema.parse('x'.repeat(250))?.length, 200);
    assert.equal(didascaliaSchema.safeParse(['a', 'b']).success, false);
    assert.equal(didascaliaSchema.safeParse('x'.repeat(2001)).success, false);
  });

  it('keeps only the name of an uploaded file, never its path', () => {
    assert.equal(nomeSicuro('C:\\fakepath\\IMG 0042.jpg'), 'IMG 0042.jpg');
    assert.equal(nomeSicuro('../../etc/passwd'), 'passwd');
    assert.equal(nomeSicuro('\u0000\u0007'), 'file');
    assert.equal(nomeSicuro('a'.repeat(300)).length, 200);
  });

  it('saves only the captions changed on the page, so a caption changed by someone else stays', () => {
    const id = 'cmabcdefghijklmnopqrstuv';
    const other = 'cmzyxwvutsrqponmlkjihgfe';
    assert.deepEqual(
      [...modificheDi({ [`didascalia-${id}`]: 'Nuova', [`prima-${id}`]: 'Vecchia' })!],
      [[id, 'Nuova']],
    );
    assert.equal(
      modificheDi({ [`didascalia-${other}`]: ' Vecchia ', [`prima-${other}`]: 'Vecchia' })!.size,
      0,
      'untouched (spaces aside): not saved',
    );
    assert.deepEqual(
      [...modificheDi({ [`didascalia-${id}`]: '', [`prima-${id}`]: 'Old' })!],
      [[id, null]],
    );
    assert.deepEqual(
      [...modificheDi({ [`didascalia-${id}`]: 'Senza prima' })!],
      [[id, 'Senza prima']],
    );
    assert.equal(
      modificheDi({ [`didascalia-${id}`]: ['a', 'b'] }),
      null,
      'a repeated field is broken',
    );
    assert.equal(modificheDi({ didascalia: 'x', 'didascalia-../x': 'y', _csrf: 't' })!.size, 0);
  });
});

describe('the photos on the print and the PDF', () => {
  const a = 'cm00000000000000000000aa';
  const b = 'cm00000000000000000000bb';
  const c = 'cm00000000000000000000cc';

  it('are chosen one by one among the icons shown; a page without the icons leaves the choice alone', () => {
    assert.deepEqual(fotoInStampaDi({}), { success: true, data: undefined });
    assert.deepEqual(fotoInStampaDi({ fotoStampa: a }), { success: true, data: undefined });
    assert.deepEqual(fotoInStampaDi({ fotoMostrate: '' }), {
      success: true,
      data: { mostrate: [], scelte: [] },
    });
    // Ticked and not shown does not count; repeated ids count once.
    assert.deepEqual(fotoInStampaDi({ fotoMostrate: `${a} ${b}  ${a}`, fotoStampa: [b, c, b] }), {
      success: true,
      data: { mostrate: [a, b], scelte: [b] },
    });
    assert.deepEqual(fotoInStampaDi({ fotoMostrate: a, fotoStampa: a }), {
      success: true,
      data: { mostrate: [a], scelte: [a] },
    });
    // Something that is not an id is tampered with.
    assert.equal(fotoInStampaDi({ fotoMostrate: `${a} ../x` }).success, false);
    assert.equal(fotoInStampaDi({ fotoMostrate: a, fotoStampa: 'SELECT' }).success, false);
    assert.equal(fotoInStampaDi({ fotoMostrate: a, fotoStampa: { x: 1 } }).success, false);
    // The form that comes back keeps what was ticked; without the icons — the saved choice.
    assert.equal(fotoFromBody({ fotoStampa: a }), undefined);
    assert.deepEqual(fotoFromBody({ fotoMostrate: a, fotoStampa: [a, 'bad'] }), [a]);
    assert.deepEqual(fotoFromBody({ fotoMostrate: '' }), []);
  });

  let n = 0;
  const file = (sezione: string, over: Partial<AllegatoVista> = {}): AllegatoVista => ({
    id: `cm${String(++n).padStart(22, '0')}`,
    sezione,
    tipo: 'FOTO',
    stato: 'PRONTO',
    didascalia: null,
    nomeOriginale: `${sezione}.jpg`,
    larghezza: 800,
    altezza: 600,
    durataMs: null,
    errore: null,
    inStampa: true,
    createdAt: new Date('2026-10-21T08:00:00Z'),
    ...over,
  });

  it('take the ticked ready photos, in the order of the sheet, also from a section not printed', () => {
    const quadro = file('quadro');
    const impianto = file('impianto');
    const argano = file('argano');
    const allegati = [
      quadro,
      file('quadro', { inStampa: false }),
      file('quadro', { tipo: 'VIDEO' }),
      file('quadro', { stato: 'IN_CODA' }),
      argano,
      impianto,
      file('porte'),
    ];
    // The order of the company: the photos follow it.
    const sections = [{ key: 'impianto' }, { key: 'argano' }, { key: 'quadro' }];
    assert.deepEqual(
      fotoPerStampa(sections, allegati).map((g) => [g.section.key, g.foto.map((f) => f.id)]),
      [
        ['impianto', [impianto.id]],
        ['argano', [argano.id]],
        ['quadro', [quadro.id]],
      ],
    );
    assert.deepEqual(
      fotoPerStampa(
        sections,
        allegati.map((f) => ({ ...f, inStampa: false })),
      ),
      [],
    );
  });

  it('show every ready photo as an icon, marking the sections that are not on the sheet', () => {
    const quadro = file('quadro', { inStampa: false });
    const argano = file('argano');
    const allegati = [
      quadro,
      argano,
      file('quadro', { stato: 'IN_LAVORAZIONE' }),
      file('cavi', { tipo: 'VIDEO' }),
    ];
    const sections = [
      { key: 'impianto' as const, title: 'Impianto' },
      { key: 'quadro' as const, title: 'Quadro' },
      { key: 'argano' as const, title: 'Argano' },
      { key: 'cavi' as const, title: 'Cavi' },
    ];
    // "Argano" excluded from the print by the sheet; a section hidden by a condition is off too.
    const nelFoglio = nelFoglioDi(new Set(['impianto', 'quadro', 'argano', 'cavi']), ['argano']);
    assert.deepEqual(
      gruppiScelta(sections, allegati, nelFoglio).map((g) => [
        g.key,
        g.esclusa,
        g.foto.map((f) => f.id),
      ]),
      [
        ['quadro', false, [quadro.id]],
        ['argano', true, [argano.id]],
      ],
    );
    assert.equal(nelFoglioDi(new Set(['impianto']), [])('quadro'), false);
    assert.equal(nelFoglioDi(new Set(['impianto']), [])('impianto'), true);
  });
});
