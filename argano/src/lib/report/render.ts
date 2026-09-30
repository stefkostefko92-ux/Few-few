import 'server-only';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { env } from '../env';
import type { ReportDoc } from './model';

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 25 * 1024 * 1024;

// report/relazione.py draws the model (JSON on stdin, PDF on stdout); no shell, fixed arguments, bounded time and size.
export function renderPdf(doc: ReportDoc): Promise<Buffer> {
  const { PYTHON_BIN, REPORT_FONT_DIR } = env();
  const script = path.join(process.cwd(), 'report', 'relazione.py');
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
      if (code === 0 && pdf.subarray(0, 5).toString('latin1') === '%PDF-') finish(null, pdf);
      else finish(new Error(`report renderer failed (${code}): ${Buffer.concat(err).toString('utf8').slice(-500)}`));
    });
    child.stdin.on('error', (e) => finish(e));
    child.stdin.end(JSON.stringify(doc));
  });
}
