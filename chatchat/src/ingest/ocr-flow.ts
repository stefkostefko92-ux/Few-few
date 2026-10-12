import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { imageSize, type DetectedMime } from '../services/filetype.js';
import {
  cleanOcrText,
  ToolError,
  toolFailure,
  withTempFile,
  type OcrEngine,
  type PageRasterizer,
} from './ocr.js';
import {
  INGEST_LIMITS,
  IngestFailure,
  type Extraction,
  type ExtractedPage,
  type IngestWarning,
} from './types.js';

/**
 * OCR по страници (§4.1): само страниците на PDF БЕЗ текстов слой и изображенията (схема/снимка →
 * документ с една страница; оригиналът остава прикаченият файл с sha256 = checksum). Таван на
 * страниците (останалите — предупреждение, не тиха загуба), срок на страница и на целия документ.
 * Страница, която не се разпозна, е предупреждение; липсващ tesseract/pdftoppm — провал.
 */

export interface OcrDeps {
  engine: OcrEngine;
  rasterizer: PageRasterizer;
  /** Папката за временните файлове (tmpfs на worker-а); '' → os.tmpdir(). */
  tmpDir: string;
  pageTimeoutMs: number;
  maxPages: number;
  /** Краен срок за целия документ (Date.now()). */
  deadline: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => Promise<void> | void;
  /** Наблюдаемост: изходът на всяка страница (без съдържание). */
  onPage?: (result: 'ok' | 'empty' | 'failed') => void;
}

const IMAGE_EXT: Partial<Record<DetectedMime, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Изображение за OCR: размерът от заглавката (без декодиране) в таваните — иначе бомба. */
export function checkImage(mime: DetectedMime, bytes: Uint8Array): void {
  const size = imageSize(mime, bytes);
  if (!size) throw new IngestFailure('ingest.err.imageInvalid');
  const { width, height } = size;
  if (
    width > INGEST_LIMITS.maxImageSide ||
    height > INGEST_LIMITS.maxImageSide ||
    width * height > INGEST_LIMITS.maxImagePixels
  ) {
    throw new IngestFailure('ingest.err.imageTooLarge');
  }
}

function overdue(deps: OcrDeps): void {
  if (deps.signal?.aborted || Date.now() > deps.deadline) {
    throw new IngestFailure('ingest.err.timeout');
  }
}

/** Една страница: растер (за PDF) → OCR → изчистен текст; грешка на страницата → null. */
async function recognizePage(deps: OcrDeps, image: () => Promise<string>): Promise<string | null> {
  const opts = { timeoutMs: deps.pageTimeoutMs, ...(deps.signal ? { signal: deps.signal } : {}) };
  try {
    const path = await image();
    return cleanOcrText(await deps.engine.recognize(path, opts));
  } catch (err) {
    const fatal = toolFailure(err);
    if (fatal) throw fatal;
    if (err instanceof ToolError && err.reason === 'aborted') {
      throw new IngestFailure('ingest.err.timeout');
    }
    if (err instanceof ToolError) return null;
    throw err;
  }
}

export async function ocrImage(
  bytes: Uint8Array,
  mime: DetectedMime,
  deps: OcrDeps,
): Promise<Extraction> {
  checkImage(mime, bytes);
  const ext = IMAGE_EXT[mime];
  if (!ext) throw new IngestFailure('ingest.err.unsupportedFormat');
  overdue(deps);
  const text = await withTempFile(deps.tmpDir, `image.${ext}`, bytes, (path) =>
    recognizePage(deps, async () => path),
  );
  await deps.onProgress?.(1, 1);
  if (text === null) {
    deps.onPage?.('failed');
    throw new IngestFailure('ingest.err.ocrFailed');
  }
  deps.onPage?.(text === '' ? 'empty' : 'ok');
  if (text === '') throw new IngestFailure('ingest.err.emptyDocument');
  return { format: 'image', pages: [{ page: 1, text }], warnings: [], ocrPages: 1 };
}

/**
 * PDF: OCR само на празните страници (номерата остават истинските — визуализаторът сочи тях).
 * Връща страниците с допълнения текст и предупрежденията за непокритото.
 */
export async function ocrPdf(
  bytes: Uint8Array,
  pages: readonly ExtractedPage[],
  deps: OcrDeps,
): Promise<{ pages: ExtractedPage[]; warnings: IngestWarning[]; ocrPages: number }> {
  const blank = pages.filter((p) => p.text.trim() === '');
  const out = new Map(pages.map((p) => [p.page, { ...p }]));
  const warnings: IngestWarning[] = [];
  if (blank.length === 0) return { pages: [...out.values()], warnings, ocrPages: 0 };
  const todo = blank.slice(0, deps.maxPages);
  if (blank.length > todo.length) {
    warnings.push({ code: 'ingest.warn.ocrPageLimit', count: blank.length - todo.length });
    for (const p of blank.slice(todo.length)) {
      warnings.push({ code: 'ingest.warn.pageWithoutText', page: p.page });
    }
  }
  let ocrPages = 0;
  await withTempFile(deps.tmpDir, 'source.pdf', bytes, async (pdfPath, dir) => {
    for (const [i, p] of todo.entries()) {
      overdue(deps);
      const base = join(dir, `p${p.page}`);
      const opts = {
        timeoutMs: deps.pageTimeoutMs,
        ...(deps.signal ? { signal: deps.signal } : {}),
      };
      const text = await recognizePage(deps, () =>
        deps.rasterizer.render(pdfPath, p.page, base, opts),
      );
      await rm(`${base}.png`, { force: true });
      if (text === null) {
        deps.onPage?.('failed');
        warnings.push({ code: 'ingest.warn.ocrPageFailed', page: p.page });
      } else if (text === '') {
        deps.onPage?.('empty');
        warnings.push({ code: 'ingest.warn.pageWithoutText', page: p.page });
      } else {
        deps.onPage?.('ok');
        ocrPages += 1;
        const page = out.get(p.page);
        if (page) page.text = text;
      }
      await deps.onProgress?.(i + 1, todo.length);
    }
  });
  return { pages: [...out.values()].sort((a, b) => a.page - b.page), warnings, ocrPages };
}
