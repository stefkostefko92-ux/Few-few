import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { ThreadParser } from '../src/ingest/isolate.js';
import { cleanOcrText } from '../src/ingest/ocr.js';
import { ocrImage, ocrPdf, type OcrDeps } from '../src/ingest/ocr-flow.js';
import { IngestFailure, type ExtractedPage } from '../src/ingest/types.js';
import { FakeOcr, FakeRasterizer } from './fake-ocr.js';
import { makePdf } from './file-fixtures.js';
import { makeDocx, makeXlsx, pngHeader } from './ingest-fixtures.js';

/**
 * OCR (§4.1): само страниците без текстов слой, таван на страниците, провалена страница —
 * предупреждение, липсващ инструмент — провал; изображенията — таван на пикселите ПРЕДИ OCR;
 * временните файлове се трият. Разборът в отделна нишка: резултат, срок, грешка → код.
 */

async function deps(
  over: Partial<OcrDeps> = {},
): Promise<OcrDeps & { engine: FakeOcr; rasterizer: FakeRasterizer }> {
  const tmp = await mkdtemp(join(tmpdir(), 'cc-ocr-test-'));
  return {
    engine: new FakeOcr(),
    rasterizer: new FakeRasterizer(),
    tmpDir: tmp,
    pageTimeoutMs: 5_000,
    maxPages: 10,
    deadline: Date.now() + 60_000,
    ...over,
  } as OcrDeps & { engine: FakeOcr; rasterizer: FakeRasterizer };
}

const failure = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (err) {
    if (err instanceof IngestFailure) return err.code;
    throw err;
  }
  return 'ok';
};

const pages = (texts: string[]): ExtractedPage[] => texts.map((text, i) => ({ page: i + 1, text }));

describe('OCR на PDF', () => {
  test('само празните страници; номерата се пазят; временната папка се изтрива', async () => {
    const d = await deps();
    const out = await ocrPdf(Buffer.from('%PDF-1.4'), pages(['testo', '', 'altro', '']), d);
    assert.deepEqual(d.rasterizer.rendered, [2, 4]);
    assert.equal(out.ocrPages, 2);
    assert.deepEqual(
      out.pages.map((p) => [p.page, p.text.startsWith('Pagina scansionata') ? 'ocr' : p.text]),
      [
        [1, 'testo'],
        [2, 'ocr'],
        [3, 'altro'],
        [4, 'ocr'],
      ],
    );
    assert.deepEqual(await readdir(d.tmpDir), [], 'нищо не остава в /tmp');
  });

  test('таван на страниците → предупреждение с броя; провалена страница → предупреждение', async () => {
    const d = await deps({ maxPages: 2 });
    d.rasterizer.failOn.add(2);
    const out = await ocrPdf(Buffer.from('%PDF'), pages(['', '', '', '']), d);
    assert.deepEqual(out.warnings, [
      { code: 'ingest.warn.ocrPageLimit', count: 2 },
      { code: 'ingest.warn.pageWithoutText', page: 3 },
      { code: 'ingest.warn.pageWithoutText', page: 4 },
      { code: 'ingest.warn.ocrPageFailed', page: 2 },
    ]);
    assert.equal(out.ocrPages, 1);
  });

  test('липсващ tesseract → ingest.err.ocrUnavailable; изтекъл срок → ingest.err.timeout', async () => {
    const d = await deps();
    d.engine.missing = true;
    assert.equal(
      await failure(() => ocrPdf(Buffer.from('%PDF'), pages(['']), d)),
      'ingest.err.ocrUnavailable',
    );
    const late = await deps({ deadline: Date.now() - 1 });
    assert.equal(
      await failure(() => ocrPdf(Buffer.from('%PDF'), pages(['']), late)),
      'ingest.err.timeout',
    );
  });
});

describe('OCR на изображение', () => {
  test('схема → документ с една страница; празен резултат → празен документ', async () => {
    const d = await deps();
    const out = await ocrImage(pngHeader(800, 600), 'image/png', d);
    assert.deepEqual([out.format, out.pages.length, out.ocrPages], ['image', 1, 1]);
    assert.match(out.pages[0]?.text ?? '', /K1/);
    const blank = Buffer.concat([pngHeader(800, 600), Buffer.from('BLANK')]);
    assert.equal(await failure(() => ocrImage(blank, 'image/png', d)), 'ingest.err.emptyDocument');
  });

  test('декомпресионна бомба (огромни пиксели) и нечетима заглавка — отказ ПРЕДИ OCR', async () => {
    const d = await deps();
    assert.equal(
      await failure(() => ocrImage(pngHeader(50_000, 50_000), 'image/png', d)),
      'ingest.err.imageTooLarge',
    );
    assert.equal(
      await failure(() => ocrImage(Buffer.from('xx'), 'image/png', d)),
      'ingest.err.imageInvalid',
    );
    assert.equal(d.engine.seen.length, 0);
  });

  test('изчистването на текста: form feed, контролни знаци, празни редове', () => {
    assert.equal(cleanOcrText('a \n\n\n\nb\f\u0007c'), 'a\n\nb\nc');
  });
});

describe('разбор в отделна нишка', () => {
  const parser = new ThreadParser({ heapMb: 256, timeoutMs: 30_000 });

  test('DOCX, XLSX (+ шаблон) и PDF — резултатът идва от нишката', async () => {
    const docx = await parser.parse({
      format: 'docx',
      mime: '',
      bytes: makeDocx([{ style: 'Titolo1', text: 'Capitolo' }, { text: 'Testo' }]),
      template: false,
      pdfTimeoutMs: 10_000,
    });
    assert.ok(docx.ok);
    assert.equal(docx.extraction.pages[0]?.section, 'Capitolo');
    const xlsx = await parser.parse({
      format: 'xlsx',
      mime: '',
      bytes: makeXlsx([
        {
          name: 'Errori',
          rows: [
            ['Code', 'Title', 'Description', 'Severity'],
            ['E1', 'Uno', 'Primo', 'FAULT'],
          ],
        },
      ]),
      template: true,
      pdfTimeoutMs: 10_000,
    });
    assert.ok(xlsx.ok);
    assert.equal(xlsx.template?.rows[0]?.code, 'E1');
    const pdf = await parser.parse({
      format: 'pdf',
      mime: 'application/pdf',
      bytes: makePdf([['Pagina uno'], []]),
      template: false,
      pdfTimeoutMs: 10_000,
    });
    assert.ok(pdf.ok);
    assert.deepEqual(
      pdf.extraction.pages.map((p) => [p.page, p.text]),
      [
        [1, 'Pagina uno'],
        [2, ''],
      ],
    );
  });

  test('провал на файла → кодът; срок → ingest.err.timeout; прекъсване отвън → timeout', async () => {
    const bad = await parser.parse({
      format: 'docx',
      mime: '',
      bytes: Buffer.from('not a zip'),
      template: false,
      pdfTimeoutMs: 1_000,
    });
    assert.deepEqual(bad, { ok: false, code: 'ingest.err.archiveInvalid', retryable: false });
    const slow = new ThreadParser({ heapMb: 256, timeoutMs: 1 });
    const timed = await slow.parse({
      format: 'docx',
      mime: '',
      bytes: makeDocx([{ text: 'x' }]),
      template: false,
      pdfTimeoutMs: 1_000,
    });
    assert.deepEqual(timed, { ok: false, code: 'ingest.err.timeout', retryable: false });
    const ctl = new AbortController();
    ctl.abort();
    const aborted = await parser.parse(
      {
        format: 'docx',
        mime: '',
        bytes: makeDocx([{ text: 'x' }]),
        template: false,
        pdfTimeoutMs: 1_000,
      },
      ctl.signal,
    );
    assert.equal(aborted.ok ? 'ok' : aborted.code, 'ingest.err.timeout');
  });
});
