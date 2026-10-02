import 'server-only';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { env } from '../env';
import type { DrawingDoc } from '@/drawing';
import type { ReportDoc } from './model';

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 25 * 1024 * 1024;

/** The relazione: report/relazione.py lays out the blocks. */
export const renderPdf = (doc: ReportDoc): Promise<Buffer> => runRenderer('relazione.py', doc);

/** The drawing set: report/tavole.py paints the sheets laid out by the drawing kernel. */
export const renderTavole = (doc: DrawingDoc): Promise<Buffer> => runRenderer('tavole.py', doc);

/** The views of a report as PNG pictures, one per plan block in their order (report/raster.py): the Word document's. */
export async function renderPictures(doc: ReportDoc): Promise<Uint8Array[]> {
  if (!doc.blocks.some((b) => b.t === 'plan')) return [];
  const out = await runRenderer('raster.py', doc, (b) => b.subarray(0, 1).toString('latin1') === '[');
  const list: unknown = JSON.parse(out.toString('utf8'));
  if (!Array.isArray(list) || !list.every((x): x is string => typeof x === 'string')) throw new Error('raster renderer: unexpected output');
  return list.map((s) => new Uint8Array(Buffer.from(s, 'base64')));
}

const isPdf = (b: Buffer): boolean => b.subarray(0, 5).toString('latin1') === '%PDF-';

// A renderer of report/ draws the model (JSON on stdin, the document on stdout, which `ok` recognises); no shell,
// fixed arguments, bounded time and size.
function runRenderer(name: 'relazione.py' | 'tavole.py' | 'raster.py', doc: ReportDoc | DrawingDoc, ok: (b: Buffer) => boolean = isPdf): Promise<Buffer> {
  const { PYTHON_BIN, REPORT_FONT_DIR } = env();
  const script = path.join(process.cwd(), 'report', name);
  return new Promise((resolve, reject) => {
    // only what the renderer needs: no secrets from the server environment reach the child process
    const childEnv: NodeJS.ProcessEnv = {
      NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? '/usr/bin:/bin', REPORT_FONT_DIR,
      LANG: 'C.UTF-8', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1',
    };
    const child = spawn(PYTHON_BIN, [script], { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv });
    const out: Buffer[] = [], err: Buffer[] = [];
    let size = 0, done = false;
    const finish = (e: Error | null, pdf?: Buffer): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (e) reject(e); else if (pdf) resolve(pdf);
    };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('report renderer timed out')); }, TIMEOUT_MS);
    child.stdout.on('data', (b: Buffer) => {
      size += b.length;
      if (size > MAX_BYTES) { child.kill('SIGKILL'); finish(new Error('report too large')); } else out.push(b);
    });
    child.stderr.on('data', (b: Buffer) => { if (err.length < 64) err.push(b); });
    child.on('error', (e) => finish(e));
    child.on('close', (code) => {
      const pdf = Buffer.concat(out);
      if (code === 0 && ok(pdf)) finish(null, pdf);
      else finish(new Error(`report renderer failed (${code}): ${Buffer.concat(err).toString('utf8').slice(-500)}`));
    });
    child.stdin.on('error', (e) => finish(e));
    child.stdin.end(JSON.stringify(doc));
  });
}
