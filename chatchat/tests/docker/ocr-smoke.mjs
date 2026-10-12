// Docker smoke тест на OCR (§4.1): ИСТИНСКИТЕ pdftoppm + tesseract (ita+eng+bul) в крайния образ,
// пуснат като в продукция — node (не root), файловата система само за четене, /tmp е tmpfs, без
// мрежа и без capabilities. Пуска се от tests/docker/ocr-smoke.sh; ползва билда (dist/) от образа.
//   1) PDF с текстов слой → pdftoppm (растер, „сканиране“) → PNG;
//   2) PDF БЕЗ текстов слой с този PNG като изображение → разборът в нишка вижда празна страница →
//      ocrPdf я растеризира и разпознава;
//   3) PNG → ocrImage (документ с една страница).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { ThreadParser } = await import('/app/dist/ingest/isolate.js');
const { PopplerRasterizer, TesseractOcr } = await import('/app/dist/ingest/ocr.js');
const { ocrImage, ocrPdf } = await import('/app/dist/ingest/ocr-flow.js');

const WORDS = ['MORSETTO', 'SICUREZZE', 'QUADRO'];
const LINES = ['MORSETTO X3 CATENA SICUREZZE', 'QUADRO LTX-500 ERRORE E37'];

/** PDF обекти → файл с xref (същото като tests/file-fixtures.ts, без зависимост към тестовете). */
function pdf(objects) {
  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let length = parts[0].length;
  objects.forEach((o, i) => {
    offsets.push(length);
    const k = i + 1;
    const chunk = Buffer.isBuffer(o.stream)
      ? Buffer.concat([
          Buffer.from(`${k} 0 obj\n<< ${o.dict} /Length ${o.stream.length} >>\nstream\n`, 'latin1'),
          o.stream,
          Buffer.from('\nendstream\nendobj\n', 'latin1'),
        ])
      : Buffer.from(`${k} 0 obj\n${o.dict}\nendobj\n`, 'latin1');
    parts.push(chunk);
    length += chunk.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

function textPdf() {
  const content = LINES.map((l, i) => `BT /F1 28 Tf 60 ${700 - i * 60} Td (${l}) Tj ET`).join('\n');
  return pdf([
    { dict: '<< /Type /Catalog /Pages 2 0 R >>' },
    { dict: '<< /Type /Pages /Kids [4 0 R] /Count 1 >>' },
    { dict: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' },
    {
      dict: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    },
    { dict: '', stream: Buffer.from(content, 'latin1') },
  ]);
}

/** PNG (RGB, 8 бита, без interlace — какъвто дава pdftoppm) → суровите редове → PDF изображение. */
function scannedPdf(png) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('latin1', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  assert.ok(colorType === 2 || colorType === 0, `неочакван PNG тип ${colorType}`);
  const colors = colorType === 2 ? 3 : 1;
  const image = Buffer.concat(idat);
  const draw = Buffer.from(`q 595 0 0 842 0 0 cm /Im1 Do Q`, 'latin1');
  return pdf([
    { dict: '<< /Type /Catalog /Pages 2 0 R >>' },
    { dict: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    {
      dict: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
    },
    {
      dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /${colors === 3 ? 'DeviceRGB' : 'DeviceGray'} /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent 8 /Columns ${width} >>`,
      stream: image,
    },
    { dict: '', stream: draw },
  ]);
}

const work = mkdtempSync(join(tmpdir(), 'ocr-smoke-'));
writeFileSync(join(work, 'text.pdf'), textPdf());
execFileSync('pdftoppm', [
  '-r',
  '200',
  '-png',
  '-singlefile',
  join(work, 'text.pdf'),
  join(work, 'scan'),
]);
const png = readFileSync(join(work, 'scan.png'));
const scanned = scannedPdf(png);

const deps = {
  engine: new TesseractOcr('ita+eng+bul'),
  rasterizer: new PopplerRasterizer(),
  tmpDir: '',
  pageTimeoutMs: 120_000,
  maxPages: 5,
  deadline: Date.now() + 300_000,
};
const upper = (s) => s.toUpperCase();

// 2) PDF без текстов слой: разборът в нишка вижда празна страница → OCR.
const parser = new ThreadParser({ heapMb: 256, timeoutMs: 60_000 });
const parsed = await parser.parse({
  format: 'pdf',
  mime: 'application/pdf',
  bytes: scanned,
  template: false,
  pdfTimeoutMs: 30_000,
});
assert.ok(parsed.ok, JSON.stringify(parsed));
assert.equal(parsed.extraction.pages[0].text, '', 'сканираната страница няма текстов слой');
const out = await ocrPdf(scanned, parsed.extraction.pages, deps);
assert.equal(out.ocrPages, 1, JSON.stringify(out.warnings));
for (const w of WORDS)
  assert.ok(
    upper(out.pages[0].text).includes(w),
    `PDF OCR: липсва „${w}“ в „${out.pages[0].text}“`,
  );

// 3) Изображението направо.
const image = await ocrImage(png, 'image/png', deps);
for (const w of WORDS) assert.ok(upper(image.pages[0].text).includes(w), `PNG OCR: липсва „${w}“`);

// Временните папки на OCR са изтрити (остава само работната на теста).
const left = readdirSync(tmpdir()).filter((n) => n.startsWith('chatchat-ingest-'));
assert.deepEqual(left, [], 'временните файлове на OCR трябва да са изтрити');

console.log(
  JSON.stringify({
    ok: true,
    pdf: out.pages[0].text.slice(0, 80),
    image: image.pages[0].text.slice(0, 80),
  }),
);
