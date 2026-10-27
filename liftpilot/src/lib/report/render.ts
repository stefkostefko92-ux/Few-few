import 'server-only';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, open, rm, writeFile, type FileHandle } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { env } from '../env';
import type { DrawingDoc } from '@/drawing';
import type { PdfBlock, ReportDoc } from './model';
import type { FascicoloDoc } from './rt2/model';
import { rendererInput } from './payload';
import { ANSWER } from '@/lib/answers';

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 25 * 1024 * 1024;
// At most this many renderers at once in the process, the others wait their turn — a document takes a second or two
// and up to a few hundred megabytes —; past a short queue, or after waiting too long, the request is refused (the
// routes answer 503 with Retry-After).
const MAX_RUNNING = 2, MAX_WAITING = 8, WAIT_MS = 20_000;

/** All the renderers are busy and the queue is full: try again in a few seconds. */
export class RendererBusy extends Error {
  constructor() {
    super('report renderers busy');
    this.name = 'RendererBusy';
  }
}

let running = 0;
const waiting: (() => void)[] = [];

function release(): void {
  running -= 1;
  waiting.shift()?.();
}

/** `fn` in a renderer's slot: whatever it reads or writes (an RT's files from the database too) waits its turn, so the
 *  bytes held at once are bounded by the slots, not by the requests. */
export async function withRendererSlot<T>(fn: () => Promise<T>): Promise<T> {
  await slot();
  try {
    return await fn();
  } finally {
    release();
  }
}

async function slot(): Promise<void> {
  if (running < MAX_RUNNING) {
    running += 1;
    return;
  }
  if (waiting.length >= MAX_WAITING) throw new RendererBusy();
  await new Promise<void>((resolve, reject) => {
    const go = (): void => {
      clearTimeout(timer);
      running += 1;
      resolve();
    };
    const timer = setTimeout(() => {
      const i = waiting.indexOf(go);
      if (i >= 0) waiting.splice(i, 1);
      reject(new RendererBusy());
    }, WAIT_MS);
    waiting.push(go);
  });
}

/** The response of a route whose renderer is busy. */
export const busyResponse = (): Response => new Response(ANSWER.busy, {
  status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5' },
});

/** The relazione (or the draft order, or the relazione tecnica di modifica's body with its signatures):
 *  report/relazione.py lays out the blocks; the PDF dated `at`, its record's date. rendererInput only serialises the
 *  document, whatever its blocks. */
export const renderPdf = (doc: ReportDoc<PdfBlock>, at: Date): Promise<Buffer> =>
  runRenderer('relazione.py', rendererInput(doc as ReportDoc, at));

/** The relazione tecnica di modifica after the owner's model (round 52): report/fascicolo.py lays out its blocks
 *  (src/lib/report/rt2/model.ts); the PDF dated `at`, its record's date. */
export const renderFascicolo = (doc: FascicoloDoc, at: Date): Promise<Buffer> =>
  runRenderer('fascicolo.py', JSON.stringify({ ...doc, meta: { ...doc.meta, created: at.toISOString() } }));

/** The drawing set: report/tavole.py paints the sheets laid out by the drawing kernel; the PDF dated `at` (the set's
 *  issue, a draft's record). */
export const renderTavole = (doc: DrawingDoc, at: Date): Promise<Buffer> => runRenderer('tavole.py', rendererInput(doc, at));

/** The views of a report as PNG pictures, one per plan block in their order (report/raster.py): the Word document's. */
export async function renderPictures(doc: ReportDoc): Promise<Uint8Array[]> {
  if (!doc.blocks.some((b) => b.t === 'plan')) return [];
  const out = await runRenderer('raster.py', rendererInput(doc), (b) => b.subarray(0, 1).toString('latin1') === '[');
  const list: unknown = JSON.parse(out.toString('utf8'));
  if (!Array.isArray(list) || !list.every((x): x is string => typeof x === 'string')) throw new Error('raster renderer: unexpected output');
  return list.map((s) => new Uint8Array(Buffer.from(s, 'base64')));
}

const isPdf = (b: Buffer): boolean => b.subarray(0, 5).toString('latin1') === '%PDF-';

// A renderer of report/ draws the model (JSON on stdin: payload.ts; the document on stdout, which `ok` recognises); no
// shell, fixed arguments, bounded time and size, a few at a time.
async function runRenderer(name: 'relazione.py' | 'tavole.py' | 'raster.py' | 'fascicolo.py', input: string, ok: (b: Buffer) => boolean = isPdf): Promise<Buffer> {
  await slot();
  try {
    const { PYTHON_BIN, REPORT_FONT_DIR } = env();
    // only what the renderer needs: no secrets from the server environment reach the child process
    const childEnv: NodeJS.ProcessEnv = {
      NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? '/usr/bin:/bin', REPORT_FONT_DIR,
      LANG: 'C.UTF-8', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1',
    };
    const script = path.join(process.cwd(), 'report', name);
    return await spawnChild({ bin: PYTHON_BIN, args: [script], env: childEnv, input, ok, timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES });
  } finally {
    release();
  }
}

export type PdfToolCommand = 'inspect' | 'assemble';
const isJson = (b: Buffer): boolean => b.subarray(0, 1).toString('latin1') === '{';
// both answer a line of JSON (assemble writes the fascicolo into its directory): an untrusted file may be slow or heavy,
// never unbounded
const PDF_TOOL: Record<PdfToolCommand, { timeoutMs: number; maxBytes: number; ok: (b: Buffer) => boolean }> = {
  inspect: { timeoutMs: 15_000, maxBytes: 64 * 1024, ok: isJson },
  assemble: { timeoutMs: 60_000, maxBytes: 64 * 1024, ok: isJson },
};
/** The largest fascicolo: each file at most twice its stored size and 4 MiB (pdf-tool.mjs inspect), the files of an RT
 *  at most 120 MiB and 40, and its body. */
export const MAX_FASCICOLO_BYTES = 512 * 1024 * 1024;
const TOOL_FILE = /^[a-z0-9][a-z0-9_-]{0,39}\.(pdf|jpg|png)$/;
const OUT_FILE = 'fascicolo.pdf';
/** The tool's data segment at most this (prlimit, where the system has it): the V8 heap flag does not bound the
 *  ArrayBuffers pdf-lib decodes into. */
const TOOL_DATA_LIMIT = 1536 * 1024 * 1024;
export const PRLIMIT = ['/usr/bin/prlimit', '/bin/prlimit'].find((p) => existsSync(p)) ?? null;

/** A file the tool reads: its name (ours only) and its bytes, whole or in pieces (an RT's file read from the database a
 *  slice at a time, never held whole). */
export type ToolFile = Uint8Array | AsyncIterable<Uint8Array>;

/** The tool's files written into `dir`, one at a time. */
async function writeFiles(dir: string, files: Readonly<Record<string, ToolFile>>): Promise<void> {
  for (const [name, data] of Object.entries(files)) {
    if (!TOOL_FILE.test(name)) throw new Error(`pdf tool: file name ${name} refused`);
    if (data instanceof Uint8Array) { await writeFile(path.join(dir, name), data, { mode: 0o600, flag: 'wx' }); continue; }
    const h = await open(path.join(dir, name), 'wx', 0o600);
    try {
      for await (const part of data) await h.write(part);
    } finally {
      await h.close();
    }
  }
}

/** The tool on a manifest whose files are in `dir`: its answer (stdout), all or nothing. */
function spawnTool(command: PdfToolCommand, manifest: Record<string, unknown>, dir: string): Promise<Buffer> {
  const { REPORT_FONT_DIR } = env();
  const { timeoutMs, maxBytes, ok } = PDF_TOOL[command];
  const node = [process.execPath, '--max-old-space-size=1024', path.join(process.cwd(), 'report', 'pdf-tool.mjs'), command];
  const [bin, ...args] = PRLIMIT ? [PRLIMIT, `--data=${TOOL_DATA_LIMIT}`, '--', ...node] : node;
  return spawnChild({
    bin, args,
    // only what the tool needs: no secrets, no NODE_OPTIONS from the server environment
    env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? '/usr/bin:/bin', REPORT_FONT_DIR },
    input: JSON.stringify({ ...manifest, dir }), ok, timeoutMs, maxBytes,
  });
}

/** `fn` with a fresh private directory (0700), removed afterwards whatever happens. */
async function inToolDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(os.tmpdir(), 'liftpilot-pdf-'));
    return await fn(dir);
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

/**
 * report/pdf-tool.mjs (pdf-lib, a Node child process with a 1 GB heap and, where the system has prlimit, a bounded data
 * segment) in the renderers' slots: `inspect` an uploaded file, `assemble` a fascicolo. The files are written into a
 * fresh private directory (0700) — inside the slot, so their bytes wait their turn —, removed afterwards whatever
 * happens; the manifest on stdin names them, with that directory as `dir`. The answer is stdout (JSON), all or nothing: a
 * run that fails, overruns its time (15 s / 60 s: killed) or its size gives none. Typed callers: src/lib/report/pdf-tool.ts.
 */
export function runPdfTool(command: PdfToolCommand, manifest: Record<string, unknown>, files: Readonly<Record<string, ToolFile>>): Promise<Buffer> {
  return withRendererSlot(() => inToolDir(async (dir) => {
    await writeFiles(dir, files);
    return spawnTool(command, manifest, dir);
  }));
}

/** An assembled fascicolo: an open file already unlinked (its bytes live until the handle is closed) and its size. */
export interface ToolOutput { handle: FileHandle; size: number }

/**
 * `assemble` into a file: as runPdfTool, the fascicolo written by the tool into its directory, checked (a PDF, at most
 * MAX_FASCICOLO_BYTES) and handed over open while the directory goes — the caller streams it and closes it.
 */
export function assembleToFile(manifest: Record<string, unknown>, files: Readonly<Record<string, ToolFile>>): Promise<ToolOutput> {
  return withRendererSlot(() => inToolDir(async (dir) => {
    await writeFiles(dir, files);
    await spawnTool('assemble', { ...manifest, out: OUT_FILE }, dir);
    const handle = await open(path.join(dir, OUT_FILE), 'r');
    try {
      const { size } = await handle.stat(), head = Buffer.alloc(5);
      await handle.read(head, 0, 5, 0);
      if (size > MAX_FASCICOLO_BYTES) throw new Error('report too large');
      if (!isPdf(head)) throw new Error('report renderer failed: not a PDF');
      return { handle, size };
    } catch (e) {
      await handle.close();
      throw e;
    }
  }));
}

export interface Child { bin: string; args: string[]; env: NodeJS.ProcessEnv; input: string; ok: (b: Buffer) => boolean; timeoutMs: number; maxBytes: number }

/** A child process with fixed arguments and its own environment: its stdout (at most `maxBytes`, recognised by `ok`),
 *  killed past `timeoutMs`; also the image tools of the sketches (image-tool.ts). */
export function spawnChild(c: Child): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(c.bin, c.args, { stdio: ['pipe', 'pipe', 'pipe'], env: c.env });
    const out: Buffer[] = [], err: Buffer[] = [];
    let size = 0, done = false;
    const finish = (e: Error | null, pdf?: Buffer): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (e) reject(e); else if (pdf) resolve(pdf);
    };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('report renderer timed out')); }, c.timeoutMs);
    child.stdout.on('data', (b: Buffer) => {
      size += b.length;
      if (size > c.maxBytes) { child.kill('SIGKILL'); finish(new Error('report too large')); } else out.push(b);
    });
    child.stderr.on('data', (b: Buffer) => { if (err.length < 64) err.push(b); });
    child.on('error', (e) => finish(e));
    child.on('close', (code) => {
      const pdf = Buffer.concat(out);
      if (code === 0 && c.ok(pdf)) finish(null, pdf);
      else finish(new Error(`report renderer failed (${code}): ${Buffer.concat(err).toString('utf8').slice(-500)}`));
    });
    child.stdin.on('error', (e) => finish(e));
    child.stdin.end(c.input);
  });
}
