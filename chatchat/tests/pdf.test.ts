import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkPages, pageWarnings } from '../src/services/ingest.js';
import { assemblePageText, extractPdfText } from '../src/services/pdf.js';
import { makePdf } from './file-fixtures.js';

/** §7.3 т. 2: текст по страници от PDF (pdfjs-dist, без работник и без canvas). */

const E37 = 'Il codice E37 indica che il cavo encoder non è collegato al morsetto X3.';

test('текст по страници: редове, абзаци, ударения; празна страница остава празна', async () => {
  const pdf = makePdf([
    [`${E37}\nSeconda riga (verifica).`, 'Nuovo paragrafo: misurare 24 V su X3.'],
    [],
    ['Pagina tre'],
  ]);
  const result = await extractPdfText(pdf);
  assert.ok(result.ok);
  assert.deepEqual(
    result.pages.map((p) => p.page),
    [1, 2, 3],
  );
  assert.equal(
    result.pages[0]?.text,
    `${E37}\nSeconda riga (verifica).\n\nNuovo paragrafo: misurare 24 V su X3.`,
  );
  assert.equal(result.pages[1]?.text, '');
  assert.equal(result.pages[2]?.text, 'Pagina tre');

  // Същото парчене като при подаден текст: абзаците стават отделни при нужда, страницата се пази.
  const chunks = chunkPages(result.pages);
  assert.ok(chunks.every((c) => c.page === 1 || c.page === 3));
  assert.ok(chunks[0]?.text.includes('morsetto X3'));
  assert.deepEqual(pageWarnings(result.pages), [{ code: 'ingest.pageWithoutText', page: 2 }]);
});

test('повреден PDF → invalid (без изключение навън)', async () => {
  const result = await extractPdfText(Buffer.from('%PDF-1.4\nnon un pdf vero\n%%EOF'));
  assert.deepEqual(result, { ok: false, reason: 'invalid' });
});

test('байтовете на викащия не се пипат (pdfjs прехвърля копие)', async () => {
  const pdf = makePdf([['Uno']]);
  const before = Buffer.from(pdf);
  await extractPdfText(pdf);
  assert.ok(pdf.equals(before));
  assert.equal(pdf.byteLength, before.byteLength);
});

test('сглобяване: по-голям отстъп = нов абзац, нов ред по височина, маркерите се пропускат', () => {
  const item = (str: string, y: number, hasEOL = false) => ({
    str,
    hasEOL,
    height: 10,
    transform: [10, 0, 0, 10, 72, y],
  });
  const out = assemblePageText([
    item('Riga uno', 700),
    item('Riga due', 688),
    { type: 'beginMarkedContent' },
    item('Paragrafo', 640, true),
    item('fine', 628),
  ]);
  assert.equal(out, 'Riga uno\nRiga due\n\nParagrafo\nfine');
});
