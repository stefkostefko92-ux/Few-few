import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IngestFailure } from './types.js';

/**
 * OCR (§4.1 „scansioni“, §7.3 т. 2–3): растеризиране на PDF страница (poppler `pdftoppm`) и
 * разпознаване (tesseract, ita+eng+bul). Файлът е враждебен — външните програми се викат САМО с
 * `execFile` (без shell, аргументите са масив), с таймаут и таван на изхода, с минимална среда
 * (PATH + OMP_THREAD_LIMIT=1, никакви тайни), във временна папка 0700 на worker-а, която се трие
 * винаги. Интерфейсите са, за да се подменят в тестовете (фалшив OCR); истинският tesseract се
 * проверява в Docker smoke теста.
 */

export interface RunOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface OcrEngine {
  /** Текстът на едно изображение (PNG/JPEG/WebP файл във временната папка). */
  recognize(imagePath: string, opts: RunOptions): Promise<string>;
}

export interface PageRasterizer {
  /** Една PDF страница → PNG във временната папка; връща пътя. */
  render(pdfPath: string, page: number, outBase: string, opts: RunOptions): Promise<string>;
}

/** Провал на външната програма: липсва (ENOENT), изтекъл срок, ненулев изход. */
export class ToolError extends Error {
  constructor(readonly reason: 'missing' | 'timeout' | 'failed' | 'aborted') {
    super(`ocr tool: ${reason}`);
    this.name = 'ToolError';
  }
}

const MAX_OUTPUT = 8 * 1024 * 1024;
/** Дълга страна на растера: A4 при ~300 dpi — достатъчно за OCR, таван на паметта (~26 MB RGB). */
export const RASTER_LONG_SIDE = 3508;

/** Средата на дъщерния процес: само PATH и ограничението на нишките — без тайните на процеса. */
function childEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    OMP_THREAD_LIMIT: '1',
    ...(process.env.TESSDATA_PREFIX ? { TESSDATA_PREFIX: process.env.TESSDATA_PREFIX } : {}),
    LANG: 'C.UTF-8',
    // fontconfig (poppler) пише кеш — в контейнера само /tmp е записваемо.
    XDG_CACHE_HOME: tmpdir(),
    HOME: tmpdir(),
  };
}

function run(bin: string, args: readonly string[], opts: RunOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      [...args],
      {
        timeout: opts.timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT,
        env: childEnv(),
        encoding: 'utf8',
        windowsHide: true,
        ...(opts.signal ? { signal: opts.signal } : {}),
      },
      (err, stdout) => {
        if (!err) return resolve(stdout);
        const e = err as NodeJS.ErrnoException & { killed?: boolean };
        if (e.code === 'ENOENT') return reject(new ToolError('missing'));
        if (e.name === 'AbortError') return reject(new ToolError('aborted'));
        if (e.killed) return reject(new ToolError('timeout'));
        reject(new ToolError('failed'));
      },
    );
  });
}

export class TesseractOcr implements OcrEngine {
  constructor(
    private readonly langs: string,
    private readonly bin = 'tesseract',
  ) {}

  async recognize(imagePath: string, opts: RunOptions): Promise<string> {
    // --psm 3: автоматично оформление на страницата; --oem 1: LSTM. Изходът е stdout (без файлове).
    return run(this.bin, [imagePath, 'stdout', '-l', this.langs, '--psm', '3', '--oem', '1'], opts);
  }
}

export class PopplerRasterizer implements PageRasterizer {
  constructor(private readonly bin = 'pdftoppm') {}

  async render(pdfPath: string, page: number, outBase: string, opts: RunOptions): Promise<string> {
    const n = String(page);
    await run(
      this.bin,
      [
        '-f',
        n,
        '-l',
        n,
        '-scale-to',
        String(RASTER_LONG_SIDE),
        '-png',
        '-singlefile',
        pdfPath,
        outBase,
      ],
      opts,
    );
    return `${outBase}.png`;
  }
}

/** Изчистен текст от OCR: без form feed и контролни знаци, без празни редове в повече. */
export function cleanOcrText(raw: string): string {
  return raw
    .replace(/\f/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Временна папка 0700 за един файл: оригиналът се записва там (0600), растерите — също; папката
 * се трие ВИНАГИ (и при грешка/таймаут).
 */
export async function withTempFile<T>(
  root: string,
  name: string,
  bytes: Uint8Array,
  use: (path: string, dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(root || tmpdir(), 'chatchat-ingest-'));
  try {
    const path = join(dir, name);
    await writeFile(path, bytes, { mode: 0o600 });
    return await use(path, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Липсващ tesseract/pdftoppm → провал без повторен опит (същото ще стане пак). */
export function toolFailure(err: unknown): IngestFailure | null {
  if (err instanceof ToolError && err.reason === 'missing') {
    return new IngestFailure('ingest.err.ocrUnavailable');
  }
  return null;
}
