// The copy of an upload the product keeps (src/lib/allegati/strip.ts, plan §0 row 7 and §6.1): a phone's JPEG loses its
// EXIF (GPS, author), XMP, IPTC, comments and vendor segments and keeps what draws it (JFIF, ICC profile, Adobe, tables,
// frame, scan) — the orientation read before, the same size after, still a picture pdf-lib embeds; a PNG loses its
// text, EXIF, time and private chunks and keeps its image data byte for byte; a PDF is kept as uploaded; keeping the
// kept copy again changes nothing. The names and fields the user sends (src/lib/allegati/kinds.ts): a base name without
// paths, controls or direction tricks; a title from the name; kinds and sections of the RT only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { prepareFile, keptJpegPieces, PNG_KEPT } from '@/lib/allegati/strip';
import { sniff } from '@/lib/allegati/sniff';
import { cleanFileName, editSchema, titleFromName, uploadMetaSchema } from '@/lib/allegati/kinds';
import { MAX_FILE_BYTES, MIME_OF } from '@/lib/allegati/limits';
import { ALLEGATO_KINDS, COMPONENTI } from '@/lib/rt/types';
import { JPEG, PERSONAL, cat, editorPng, includes, pdf, phoneJpeg, png, segment } from './allegati-fixtures';

const markers = (b: Uint8Array): number[] => {
  const s = sniff(b);
  assert.ok(s.ok && s.type === 'jpeg');
  return s.pieces.flatMap((p) => (p.marker === null ? [] : [p.marker]));
};

test('JPEG del telefono: via EXIF (GPS, autore), XMP, IPTC, commento e segmento del produttore; resta ciò che disegna', async () => {
  const phone = phoneJpeg(6);
  for (const v of Object.values(PERSONAL)) assert.ok(includes(phone, v), `the fixture carries «${v}»`);
  const kept = prepareFile(phone);
  assert.ok(kept.ok && kept.type === 'jpeg');
  assert.equal(kept.mime, 'image/jpeg');
  for (const v of Object.values(PERSONAL)) assert.ok(!includes(kept.data, v), `«${v}» removed`);
  assert.ok(!includes(kept.data, 'Exif\0\0') && !includes(kept.data, 'http://ns.adobe.com/xap/1.0/'));
  // the orientation was read before EXIF went, and the size is the same
  assert.deepEqual([kept.width, kept.height, kept.orientation], [24, 12, 6]);
  assert.ok(kept.removed > 200);
  // what draws the picture stays: JFIF (E0), ICC profile (E2), Adobe (EE), tables, frame, scan; no E1, EC, ED, FE
  const m = markers(kept.data);
  for (const keep of [0xd8, 0xe0, 0xe2, 0xee, 0xdb, 0xc0, 0xc4, 0xda, 0xd9]) assert.ok(m.includes(keep), keep.toString(16));
  for (const gone of [0xe1, 0xec, 0xed, 0xfe]) assert.ok(!m.includes(gone), gone.toString(16));
  // the plain JPEG of the fixture loses nothing (only JFIF, tables, frame, scan)
  const plain = prepareFile(JPEG);
  assert.ok(plain.ok && plain.removed === 0 && Buffer.from(plain.data).equals(Buffer.from(JPEG)));
  // still a picture the fascicolo embeds, at the same size
  const doc = await PDFDocument.create(), img = await doc.embedJpg(kept.data);
  assert.deepEqual([img.width, img.height], [24, 12]);
});

test('JPEG: ciò che segue la fine dell’immagine non viene conservato', () => {
  const kept = prepareFile(cat(JPEG, JPEG, Uint8Array.from(Buffer.from('%PDF-1.7 coda'))));
  assert.ok(kept.ok && kept.type === 'jpeg');
  assert.ok(Buffer.from(kept.data).equals(Buffer.from(JPEG)));
  assert.equal(kept.removed, JPEG.length + 13);
});

test('PNG: via testo, XMP, EXIF, ora e blocchi privati; i dati dell’immagine identici', async () => {
  const ed = editorPng();
  const kept = prepareFile(ed);
  assert.ok(kept.ok && kept.type === 'png');
  for (const v of [PERSONAL.author, PERSONAL.xmp, PERSONAL.vendor]) assert.ok(includes(ed, v) && !includes(kept.data, v), v);
  const s = sniff(kept.data);
  assert.ok(s.ok && s.type === 'png');
  assert.deepEqual(s.chunks.map((c) => c.type), ['IHDR', 'gAMA', 'pHYs', 'IDAT', 'IEND']);
  assert.ok(s.chunks.every((c) => PNG_KEPT.has(c.type)));
  // the image data byte for byte
  const idat = (b: Uint8Array): Buffer => {
    const r = sniff(b);
    assert.ok(r.ok && r.type === 'png');
    const c = r.chunks.find((x) => x.type === 'IDAT');
    assert.ok(c);
    return Buffer.from(b.subarray(c.start, c.end));
  };
  assert.ok(idat(kept.data).equals(idat(ed)));
  assert.deepEqual([kept.width, kept.height, kept.orientation], [30, 20, null]);
  const doc = await PDFDocument.create(), img = await doc.embedPng(kept.data);
  assert.deepEqual([img.width, img.height], [30, 20]);
  // a PNG with nothing to remove is kept as it is
  const plain = png(30, 20), same = prepareFile(plain);
  assert.ok(same.ok && same.removed === 0 && Buffer.from(same.data).equals(Buffer.from(plain)));
});

test('PDF conservato com’è; conservare di nuovo la copia conservata non cambia nulla', async () => {
  const doc = await pdf(3), kept = prepareFile(doc);
  assert.ok(kept.ok && kept.type === 'pdf' && kept.mime === MIME_OF.pdf && kept.data === doc && kept.removed === 0);
  for (const f of [phoneJpeg(3), editorPng()]) {
    const once = prepareFile(f);
    assert.ok(once.ok);
    const twice = prepareFile(once.data);
    assert.ok(twice.ok && twice.removed === 0 && Buffer.from(twice.data).equals(Buffer.from(once.data)));
  }
  assert.deepEqual(prepareFile(Uint8Array.from(Buffer.from('MZ program'))), { ok: false, reason: 'type' });
  assert.equal(keptJpegPieces(JPEG, []).length, 0);
});

test('nome del file: solo il nome, senza percorsi, caratteri di controllo né inversioni di direzione; mai vuoto; 120 caratteri', () => {
  assert.equal(cleanFileName('../../etc/passwd', 'pdf'), 'passwd');
  assert.equal(cleanFileName('C:\\Users\\mario\\Desktop\\Dichiarazione UE.pdf', 'pdf'), 'Dichiarazione UE.pdf');
  assert.equal(cleanFileName('schema\u0000\u0007elettrico\r\n.pdf', 'pdf'), 'schema elettrico .pdf');
  // «foto‮gpj.exe» shows as «fotoexe.jpg»: the override goes
  assert.equal(cleanFileName('foto\u202egpj.exe', 'jpeg'), 'foto gpj.exe');
  assert.equal(cleanFileName('...', 'png'), 'documento.png');
  assert.equal(cleanFileName('', 'jpeg'), 'documento.jpg');
  assert.equal(cleanFileName('.htaccess', 'pdf'), 'htaccess');
  const long = cleanFileName(`${'é'.repeat(200)}.pdf`, 'pdf');
  assert.equal(Array.from(long).length, 120);
  // a character outside the BMP counts once, as PostgreSQL's char_length
  assert.equal(Array.from(cleanFileName('📄'.repeat(130), 'pdf')).length, 120);
  assert.equal(cleanFileName('Cafe\u0301.pdf', 'pdf'), 'Café.pdf', 'NFC');
});

test('titolo dal nome del file; tipo, titolo e sezione validati (stringhe vuote = assenti)', () => {
  assert.equal(titleFromName('Dichiarazione_UE_quadro.pdf'), 'Dichiarazione UE quadro');
  assert.equal(titleFromName('.pdf'), 'Documento');
  assert.equal(Array.from(titleFromName(`${'a'.repeat(300)}.pdf`)).length, 160);
  assert.deepEqual(uploadMetaSchema.parse({ kind: 'FOTO', title: '  ', component: '' }), { kind: 'FOTO', title: undefined, component: undefined });
  assert.deepEqual(uploadMetaSchema.parse({ kind: 'SCHEMA_ELETTRICO', title: ' Schema\telettrico ', component: 'quadro' }), { kind: 'SCHEMA_ELETTRICO', title: 'Schema elettrico', component: 'quadro' });
  for (const bad of [{ kind: 'EXE' }, { kind: 'FOTO', component: 'cantina' }, { kind: 'FOTO', title: 'x'.repeat(161) }, { kind: 'FOTO', extra: '1' }, {}]) {
    assert.equal(uploadMetaSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
  for (const k of ALLEGATO_KINDS) assert.ok(uploadMetaSchema.safeParse({ kind: k }).success, k);
  for (const c of COMPONENTI) assert.ok(uploadMetaSchema.safeParse({ kind: 'ALTRO', component: c }).success, c);
  assert.deepEqual(editSchema.parse({ id: 'abc123', kind: 'ALTRO', title: 'Nuovo', component: null }), { id: 'abc123', kind: 'ALTRO', title: 'Nuovo', component: undefined });
  assert.equal(editSchema.safeParse({ id: '../x', kind: 'ALTRO', title: 'Nuovo' }).success, false);
  assert.equal(editSchema.safeParse({ id: 'abc', kind: 'ALTRO', title: '' }).success, false);
  assert.equal(editSchema.safeParse({ id: 'abc', kind: 'ALTRO', title: 'x', fileName: 'y' }).success, false, 'only the three editable columns');
  assert.equal(MAX_FILE_BYTES, 20_971_520, 'the CHECK of Attachment.size');
});

test('JPEG: la miniatura va via — l’estensione JFXX intera e i pixel della miniatura nel JFIF, con la stessa immagine dopo', async () => {
  // a 2 × 1 thumbnail in the JFIF header (6 bytes of RGB) and a JFXX extension carrying a thumbnail of its own
  const pixels = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66];
  const jfif = segment(0xe0, Uint8Array.from([...Buffer.from('JFIF\0', 'latin1'), 1, 1, 0, 0, 1, 0, 1, 2, 1, ...pixels]));
  const jfxx = segment(0xe0, Uint8Array.from([...Buffer.from('JFXX\0', 'latin1'), 0x13, 1, 1, 0xab, 0xcd, 0xef]));
  const withThumbs = cat(JPEG.subarray(0, 2), jfif, jfxx, JPEG.subarray(20));
  assert.ok(sniff(withThumbs).ok, 'the fixture is a JPEG');
  const kept = prepareFile(withThumbs);
  assert.ok(kept.ok && kept.type === 'jpeg');
  assert.ok(!includes(kept.data, 'JFXX'), 'the JFXX extension removed');
  assert.ok(!Buffer.from(kept.data).includes(Buffer.from(pixels)), 'the JFIF thumbnail’s pixels removed');
  // the JFIF header stays, with a thumbnail of 0 × 0 and the length of the bare header
  const app0 = Buffer.from(kept.data).subarray(2, 20);
  assert.deepEqual([...app0.subarray(0, 4)], [0xff, 0xe0, 0, 16]);
  assert.deepEqual([...app0.subarray(16, 18)], [0, 0]);
  assert.equal(app0.subarray(4, 9).toString('latin1'), 'JFIF\0');
  // the same picture: the same size and the rest of the file byte for byte
  const s = sniff(kept.data);
  assert.ok(s.ok && s.type === 'jpeg' && s.width === 24 && s.height === 12);
  assert.deepEqual(Buffer.from(kept.data).subarray(20), Buffer.from(JPEG.subarray(20)));
  assert.equal((await (await PDFDocument.create()).embedJpg(kept.data)).width, 24, 'still a picture pdf-lib embeds');
  // a JFIF header without a thumbnail is kept as it is
  const plain = prepareFile(JPEG);
  assert.ok(plain.ok && Buffer.from(plain.data).equals(Buffer.from(JPEG)));
});
