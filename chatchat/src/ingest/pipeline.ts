import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { DetectedMime } from '../services/filetype.js';
import type { AttachmentStore } from '../storage/attachments.js';
import type { JobBus } from '../queue/inline.js';
import { jobId, type DeadLetter, type JobContext } from '../queue/jobs.js';
import { finalizeItem } from './finalize.js';
import { detectOoxml, formatOfMime } from './formats.js';
import type { Parser } from './isolate.js';
import { claimItem, failItem, loadSource, setStage, type ItemWithBatch } from './items.js';
import type { OcrEngine, PageRasterizer } from './ocr.js';
import { ocrImage, ocrPdf, type OcrDeps } from './ocr-flow.js';
import type { ParseFormat } from './parse.js';
import { IngestFailure, type Extraction, type IngestFormat } from './types.js';

/**
 * Потокът на един файл през опашките (§7.3): `ingest` (извличане в отделна нишка) → при нужда
 * `ocr` (страниците без текстов слой, изображенията) → документ-ЧЕРНОВА. Задачата носи само id на
 * файла; всичко останало се чете наново от базата и хранилището (и при повторен опит). Провал от
 * самия файл (враждебен, повреден, неподдържан, грешни метаданни) → FAILED веднага, без повторни
 * опити; временна грешка (база, диск, срок на опита) → изключение → опашката опитва пак.
 */

export interface IngestSettings {
  tmpDir: string;
  ocrMaxPages: number;
  ocrPageTimeoutMs: number;
  ocrTimeoutMs: number;
  /** Вътрешният срок на pdf.js в нишката. */
  parseTimeoutMs: number;
}

export interface PipelineDeps {
  /** Ролята на приложението: всичко по файла — под RLS в контекста на клиента му (`queue/runtime.ts`). */
  db: PrismaClient;
  /** Системната роля — САМО клиентът на файла по id от задачата (задачата не носи клиент). */
  system: PrismaClient;
  store: AttachmentStore;
  bus: Pick<JobBus, 'enqueue'>;
  parser: Parser;
  /** null → OCR_ENGINE=off: сканираните страници остават празни, снимките се отказват. */
  ocr: { engine: OcrEngine; rasterizer: PageRasterizer } | null;
  settings: IngestSettings;
  logger: Pick<Logger, 'warn' | 'info'>;
  /** Наблюдаемост (без съдържание): изходът на файла и на всяка OCR страница. */
  onItem?: (format: IngestFormat | 'unknown', result: 'done' | 'failed') => void;
  onOcrPage?: (result: 'ok' | 'empty' | 'failed') => void;
}

/** Форматът на оригинала по MIME-а от качването + повторна проверка на пакета (DOCX/XLSX). */
function formatOf(mime: string, bytes: Uint8Array): IngestFormat {
  const format = formatOfMime(mime);
  if (!format) throw new IngestFailure('ingest.err.unsupportedFormat');
  if (format === 'docx' || format === 'xlsx') {
    const kind = detectOoxml(bytes);
    if (kind === 'macro') throw new IngestFailure('ingest.err.macroEnabled');
    if (kind !== format) throw new IngestFailure('ingest.err.unsupportedFormat');
  }
  return format;
}

async function parse(
  deps: PipelineDeps,
  item: ItemWithBatch,
  format: ParseFormat,
  mime: string,
  bytes: Buffer,
  signal: AbortSignal,
) {
  const outcome = await deps.parser.parse(
    {
      format,
      mime,
      bytes,
      template: format === 'xlsx' && item.batch.importErrorCodes,
      pdfTimeoutMs: deps.settings.parseTimeoutMs,
    },
    signal,
  );
  if (!outcome.ok) throw new IngestFailure(outcome.code, outcome.retryable);
  return outcome;
}

/**
 * Изпълнява етапа: провал от самия файл → FAILED (без повторни опити), временна грешка → нагоре
 * към опашката. `finalized` → файлът е DONE (за метриката); предаването към OCR не е край.
 */
async function done(
  deps: PipelineDeps,
  item: ItemWithBatch,
  seen: { format: IngestFormat | 'unknown' },
  run: () => Promise<'finalized' | 'handed_off'>,
): Promise<void> {
  try {
    if ((await run()) === 'finalized') deps.onItem?.(seen.format, 'done');
  } catch (err) {
    if (err instanceof IngestFailure && !err.retryable) {
      if (await failItem(deps.db, item.id, err.code)) deps.onItem?.(seen.format, 'failed');
      return;
    }
    throw err;
  }
}

/** Опашка `ingest`: извличане; сканиран PDF/изображение → предава на `ocr`. */
export async function runIngestJob(
  deps: PipelineDeps,
  itemId: string,
  ctx: JobContext,
): Promise<void> {
  const item = await claimItem(deps.db, itemId, 'extract');
  if (!item) return;
  const seen: { format: IngestFormat | 'unknown' } = { format: 'unknown' };
  await done(deps, item, seen, async () => {
    const { attachment, bytes } = await loadSource(deps.db, deps.store, item);
    const format = formatOf(attachment.mime, bytes);
    seen.format = format;
    await setStage(deps.db, item.id, { format });
    if (format === 'image') {
      if (!deps.ocr) throw new IngestFailure('ingest.err.ocrUnavailable');
      return handOff(deps, item);
    }
    const parsed = await parse(deps, item, format, attachment.mime, bytes, ctx.signal);
    const blank = parsed.extraction.pages.some((p) => p.text.trim() === '');
    if (format === 'pdf' && blank && deps.ocr) return handOff(deps, item);
    await setStage(deps.db, item.id, { stage: 'index' });
    await finalizeItem(deps.db, item, attachment, parsed.extraction, parsed.template);
    return 'finalized';
  });
}

/** Предаване към OCR: етапът е `ocr`, задачата е идемпотентна по id на файла. */
async function handOff(deps: PipelineDeps, item: ItemWithBatch): Promise<'handed_off'> {
  await setStage(deps.db, item.id, { stage: 'ocr', progress: 0 });
  const id = jobId('ocr', item.id, item.retries);
  await deps.bus.enqueue('ocr', { itemId: item.id }, { jobId: id });
  return 'handed_off';
}

/** Опашка `ocr`: страниците без текст (PDF) или изображението → документ. */
export async function runOcrJob(
  deps: PipelineDeps,
  itemId: string,
  ctx: JobContext,
): Promise<void> {
  const item = await claimItem(deps.db, itemId, 'ocr');
  if (!item) return;
  const tools = deps.ocr;
  const seen = { format: (item.format as IngestFormat | null) ?? ('unknown' as const) };
  await done(deps, item, seen, async () => {
    if (!tools) throw new IngestFailure('ingest.err.ocrUnavailable');
    const { attachment, bytes } = await loadSource(deps.db, deps.store, item);
    const format = formatOf(attachment.mime, bytes);
    const ocr: OcrDeps = {
      ...tools,
      tmpDir: deps.settings.tmpDir,
      pageTimeoutMs: deps.settings.ocrPageTimeoutMs,
      maxPages: deps.settings.ocrMaxPages,
      deadline: Date.now() + deps.settings.ocrTimeoutMs,
      signal: ctx.signal,
      onProgress: (n, total) =>
        setStage(deps.db, item.id, { progress: Math.round((100 * n) / Math.max(total, 1)) }),
      ...(deps.onOcrPage ? { onPage: deps.onOcrPage } : {}),
    };
    let extraction: Extraction;
    if (format === 'image') {
      extraction = await ocrImage(bytes, attachment.mime as DetectedMime, ocr);
    } else if (format === 'pdf') {
      const parsed = await parse(deps, item, 'pdf', attachment.mime, bytes, ctx.signal);
      const filled = await ocrPdf(bytes, parsed.extraction.pages, ocr);
      extraction = { format: 'pdf', ...filled };
    } else {
      throw new IngestFailure('ingest.err.unsupportedFormat');
    }
    await setStage(deps.db, item.id, { stage: 'index' });
    await finalizeItem(deps.db, item, attachment, extraction, null);
    return 'finalized';
  });
}

/** Мъртво писмо от `ingest`/`ocr`: файлът става FAILED (временната грешка не е минала). */
export async function onIngestDead(deps: PipelineDeps, letter: DeadLetter): Promise<void> {
  if (letter.queue !== 'ingest' && letter.queue !== 'ocr') return;
  const itemId = (letter.data as { itemId?: unknown }).itemId;
  if (typeof itemId !== 'string') return;
  const code = letter.reason === 'JobTimeout' ? 'ingest.err.timeout' : 'ingest.err.internal';
  if (await failItem(deps.db, itemId, code)) deps.onItem?.('unknown', 'failed');
  deps.logger.warn({ queue: letter.queue, itemId, reason: letter.reason }, 'dead-letter');
}
