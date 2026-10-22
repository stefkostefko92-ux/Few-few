import 'server-only';
// The pictures of a survey sketch (round 50), each made in a child process of the renderers' slots — the uploaded
// bytes are untrusted, a decoder may be slow or heavy, never unbounded: fixed arguments, a fresh private directory
// (0700) removed afterwards whatever happens, a timeout, the data segment bounded by prlimit where the system has it,
// only PATH and the locale in the environment (no secret of the server reaches the child). Three tools: heif-convert
// (Debian's libheif-examples) turns a HEIC upload into a JPEG; pdftoppm (poppler-utils) draws a PDF page; Pillow
// (report/schizzo.py) turns a JPEG or PNG the way the phone held it and scales it. The pictures the product shows or
// sends to be read are always made by us: never the uploaded bytes.
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { env } from '../env';
import type { AllegatoType } from '@/lib/allegati/limits';
import type { HeicInfo } from '@/lib/allegati/heic';
import { PRLIMIT, spawnChild, withRendererSlot } from './render';

/** The pages of a PDF sketch the product shows and reads: the first four. */
export const SCHIZZO_PAGINE = 4;
/** The longest side of a preview [px]. */
export const PREVIEW_EDGE = 1600;
/** The longest side and the pixels of a picture sent to be read (Claude's high-resolution limit: 2576 px, 3.75 MP). */
export const MODEL_EDGE = 2576;
export const MODEL_PIXELS = 3_750_000;
/** A picture sent to be read stays under this many bytes (JPEG quality lowered when needed; the API takes 5 MB). */
export const MODEL_BYTES = 3_750_000;

/** The child's data segment at most this (a 40-megapixel picture decodes in a few hundred megabytes). */
const DATA_LIMIT = 1024 * 1024 * 1024;
/** A preview's page is cut short sooner (`previewPdf`): it is drawn while someone waits beside a form, and one heavy page
 *  must not hold a renderer's slot that every company's documents share; the pictures sent to be read keep `pdf`. */
const TIMEOUT: Readonly<Record<'heif' | 'pdf' | 'previewPdf' | 'pillow', number>> = { heif: 30_000, pdf: 20_000, previewPdf: 8_000, pillow: 20_000 };
/** No picture a tool writes is larger than this (a 40-megapixel JPEG at quality 92 is about 15 MB). */
const MAX_OUT = 32 * 1024 * 1024;

export class ImageToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageToolError';
  }
}

/** A tool on fixed arguments: its stdout is ignored (a status line at most), the files it writes are what counts. */
function run(tool: string, args: string[], timeoutMs: number, input = ''): Promise<Buffer> {
  const [bin, ...rest] = PRLIMIT ? [PRLIMIT, `--data=${DATA_LIMIT}`, '--', tool, ...args] : [tool, ...args];
  return spawnChild({
    bin, args: rest, input, ok: () => true, timeoutMs, maxBytes: 64 * 1024,
    env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' },
  });
}

/** `fn` in a renderer's slot with a fresh private directory (0700), removed afterwards whatever happens. */
function inSlot<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  return withRendererSlot(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'liftpilot-img-'));
    try {
      return await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

/** A file a tool wrote, bounded in size. */
async function output(file: string): Promise<Buffer> {
  const s = await stat(file).catch(() => null);
  if (!s?.isFile() || s.size === 0 || s.size > MAX_OUT) throw new ImageToolError('image tool: no output or too large');
  return readFile(file);
}

/**
 * The primary image of a HEIC upload as a JPEG (quality 92, libheif's rotation and mirroring applied; its EXIF is left
 * for prepareFile to remove). heif-convert writes every top-level image (out.jpg for one, out-1.jpg … out-n.jpg for
 * several, in the order sniffHeic counted): the primary's is taken, and a count that differs refuses the file.
 */
export function heicToJpeg(data: Uint8Array, info: HeicInfo): Promise<Buffer> {
  return inSlot(async (dir) => {
    await writeFile(path.join(dir, 'in.heic'), data, { mode: 0o600, flag: 'wx' });
    await run('heif-convert', ['-q', '92', path.join(dir, 'in.heic'), path.join(dir, 'out.jpg')], TIMEOUT.heif);
    const written = (await readdir(dir)).filter((f) => /^out(?:-\d+)?\.jpg$/.test(f));
    if (written.length !== info.images) throw new ImageToolError(`heif-convert wrote ${written.length} images, ${info.images} expected`);
    return output(path.join(dir, info.images === 1 ? 'out.jpg' : `out-${info.primary + 1}.jpg`));
  });
}

/** A stored file the tools read: its bytes, loaded inside the renderer's slot (whole: at most 20 MiB — the bytes held at
 *  once are bounded by the slots, not by the requests), its kind and EXIF orientation. */
export interface StoredPicture { load: () => Promise<Uint8Array>; type: AllegatoType; orientation: number | null }

interface PillowJob { in: string; out: string; orientation: number | null; maxEdge: number; maxPixels?: number; format: 'jpeg' | 'png'; quality?: number; maxBytes?: number }

async function pillow(dir: string, jobs: PillowJob[]): Promise<void> {
  const { PYTHON_BIN } = env();
  await run(PYTHON_BIN, [path.join(process.cwd(), 'report', 'schizzo.py')], TIMEOUT.pillow, JSON.stringify({ dir, jobs }));
}

/** pdftoppm on pages `first`..`last` scaled to `edge` px on their longest side, killed past `timeoutMs`: the PNG files
 *  it wrote, in page order. */
async function pdfPages(dir: string, first: number, last: number, edge: number, timeoutMs: number): Promise<string[]> {
  await run('pdftoppm', ['-f', String(first), '-l', String(last), '-scale-to', String(edge), '-png', path.join(dir, 'in.pdf'), path.join(dir, 'p')], timeoutMs);
  const pages = (await readdir(dir)).map((f) => /^p-(\d+)\.png$/.exec(f)).filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1])).map((m) => m[0]);
  if (pages.length !== last - first + 1) throw new ImageToolError(`pdftoppm wrote ${pages.length} pages, ${last - first + 1} expected`);
  return pages;
}

const EXT: Readonly<Record<AllegatoType, string>> = { pdf: 'pdf', jpeg: 'jpg', png: 'png' };

/**
 * The preview of a sketch beside the form: a picture turned upright and at most PREVIEW_EDGE px on its longest side, in
 * its own format (a JPEG at quality 85, a PNG); a PDF's page `page` (1-based) drawn by pdftoppm as a PNG within 8 s.
 * Throws RendererBusy when the renderers are busy, ImageToolError (or the child's error) when the file cannot be drawn.
 * The route keeps the previews it made and draws one at a time (src/server/schizzi/anteprime.ts).
 */
export function previewOf(f: StoredPicture, page: number): Promise<{ bytes: Buffer; mime: 'image/png' | 'image/jpeg' }> {
  return inSlot(async (dir) => {
    await writeFile(path.join(dir, `in.${EXT[f.type]}`), await f.load(), { mode: 0o600, flag: 'wx' });
    if (f.type === 'pdf') {
      const [png] = await pdfPages(dir, page, page, PREVIEW_EDGE, TIMEOUT.previewPdf);
      return { bytes: await output(path.join(dir, png ?? 'p-1.png')), mime: 'image/png' };
    }
    const format = f.type === 'png' ? 'png' : 'jpeg', out = `out.${f.type === 'png' ? 'png' : 'jpg'}`;
    await pillow(dir, [{ in: `in.${EXT[f.type]}`, out, orientation: f.orientation, maxEdge: PREVIEW_EDGE, format, quality: 85 }]);
    return { bytes: await output(path.join(dir, out)), mime: format === 'png' ? 'image/png' : 'image/jpeg' };
  });
}

/**
 * The pictures of a sketch sent to be read: a picture turned upright, a PDF's first SCHIZZO_PAGINE pages drawn by
 * pdftoppm, each at most MODEL_EDGE px on its longest side and MODEL_PIXELS pixels, as a JPEG under MODEL_BYTES (made by
 * us: white where it was transparent, no metadata).
 */
export function modelImages(f: StoredPicture, pages: number): Promise<Buffer[]> {
  return inSlot(async (dir) => {
    await writeFile(path.join(dir, `in.${EXT[f.type]}`), await f.load(), { mode: 0o600, flag: 'wx' });
    const sources = f.type === 'pdf' ? await pdfPages(dir, 1, Math.max(1, Math.min(SCHIZZO_PAGINE, pages)), MODEL_EDGE, TIMEOUT.pdf) : [`in.${EXT[f.type]}`];
    const jobs: PillowJob[] = sources.map((src, i) => ({
      in: src, out: `m${i + 1}.jpg`, orientation: f.type === 'pdf' ? null : f.orientation, maxEdge: MODEL_EDGE, maxPixels: MODEL_PIXELS,
      format: 'jpeg', quality: 90, maxBytes: MODEL_BYTES,
    }));
    await pillow(dir, jobs);
    return Promise.all(jobs.map((j) => output(path.join(dir, j.out))));
  });
}
