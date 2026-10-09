import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Текст от PDF по страници (§7.3 т. 2) с pdfjs-dist, legacy билда за Node: в Node pdfjs сам
 * изключва уеб работника и парсва в процеса („fake worker“), а canvas трябва само за рендериране —
 * тук само четем текстовия слой. Без шрифтове на системата, без XFA, без скриптове.
 * Сканиран PDF (страница без текстов слой) дава празна страница — OCR не правим, викащият
 * връща предупреждение `ingest.pageWithoutText`.
 * Файлът е недоверен вход: таван на страниците и на текста, общ краен срок.
 */

export const PDF_MAX_PAGES = 3000;
const PAGE_TEXT_MAX = 100_000;
/** Разстояние между редове над толкова височини на реда = нов абзац (за парчетата). */
const PARAGRAPH_GAP = 1.8;

export type PdfFailure = 'encrypted' | 'invalid' | 'too_many_pages' | 'timeout';
export type PdfExtract =
  { ok: true; pages: Array<{ page: number; text: string }> } | { ok: false; reason: PdfFailure };

interface TextPiece {
  str: string;
  hasEOL: boolean;
  height: number;
  transform: number[];
}

/** Сглобява текста на страницата: редовете с „\n“, абзаците (по-голям отстъп) с празен ред. */
export function assemblePageText(items: readonly unknown[]): string {
  let out = '';
  let lastY: number | null = null;
  let lastH = 0;
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null || !('str' in raw)) continue;
    const item = raw as TextPiece;
    const y = item.transform[5] ?? 0;
    const lineH = Math.max(item.height, lastH, 1);
    if (lastY !== null && out.trim() !== '') {
      const gap = Math.abs(lastY - y);
      if (gap > PARAGRAPH_GAP * lineH) out = `${out.trimEnd()}\n\n`;
      else if (gap > lineH / 2 && !out.endsWith('\n')) out += '\n';
    }
    out += item.str;
    if (item.hasEOL) out += '\n';
    lastY = y;
    lastH = item.height;
    if (out.length > PAGE_TEXT_MAX) break;
  }
  return out
    .slice(0, PAGE_TEXT_MAX)
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

class Timeout extends Error {}

/** Пътищата до данните на pdfjs (cmaps, стандартни шрифтове) — за по-точен текстов слой. */
function assetDirs(): { cMapUrl: string; standardFontDataUrl: string } {
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  return {
    cMapUrl: `${join(root, 'cmaps')}/`,
    standardFontDataUrl: `${join(root, 'standard_fonts')}/`,
  };
}

export async function extractPdfText(bytes: Uint8Array, timeoutMs = 60_000): Promise<PdfExtract> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const deadline = Date.now() + timeoutMs;
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Timeout()), timeoutMs);
  });
  expired.catch(() => undefined);
  const within = <T>(p: Promise<T>) => Promise.race([p, expired]);

  const task = pdfjs.getDocument({
    // pdfjs иска Uint8Array (не Buffer) и го прехвърля — копие, за да не пипа нашия.
    data: new Uint8Array(bytes),
    ...assetDirs(),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    stopAtErrors: false,
  });
  try {
    const doc = await within(task.promise);
    if (doc.numPages > PDF_MAX_PAGES) return { ok: false, reason: 'too_many_pages' };
    const pages: Array<{ page: number; text: string }> = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      if (Date.now() > deadline) return { ok: false, reason: 'timeout' };
      const page = await within(doc.getPage(n));
      const content = await within(page.getTextContent());
      pages.push({ page: n, text: assemblePageText(content.items) });
      page.cleanup();
    }
    return { ok: true, pages };
  } catch (err) {
    if (err instanceof Timeout) return { ok: false, reason: 'timeout' };
    if (err instanceof pdfjs.PasswordException) return { ok: false, reason: 'encrypted' };
    return { ok: false, reason: 'invalid' };
  } finally {
    clearTimeout(timer);
    await task.destroy().catch(() => undefined);
  }
}
