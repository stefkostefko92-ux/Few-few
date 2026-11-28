/**
 * Бутоните (критерий 6): таблица задача → argv за `spawn(..., { shell: false })` — никога шел низ, затова
 * име с „; rm“ или „$(id)“ остава един аргумент. Пътищата минават през безопасния резолвер. `--run` и
 * `--force` (истинско пускане / презапис) искат изрично потвърждение. Един рендер наведнъж; „Спри“ убива
 * цялото дърво на процесите (ffmpeg е дете на node).
 */
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { safeOutput, safeResolve, PathError } from './files.js';

export const TASK_IDS = [
  'doctor',
  'loudnorm',
  'frames',
  'master',
  'youtube4k60',
  'vertical916',
] as const;
export type TaskId = (typeof TASK_IDS)[number];

export class TaskError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'task',
  ) {
    super(message);
  }
}

export interface TaskParams {
  in?: unknown;
  out?: unknown;
  pattern?: unknown;
  audio?: unknown;
  run?: unknown;
  force?: unknown;
  confirm?: unknown;
}

export interface Command {
  cmd: string;
  args: string[];
  cwd: string;
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v) throw new TaskError(400, `липсва „${name}“`);
  return v;
};

async function inPath(root: string, v: unknown, name: string): Promise<string> {
  try {
    return await safeResolve(root, str(v, name));
  } catch (e) {
    if (e instanceof PathError) throw new TaskError(400, `${name}: ${e.message}`);
    throw e;
  }
}

async function outPath(root: string, v: unknown, name: string): Promise<string> {
  try {
    return await safeOutput(root, str(v, name));
  } catch (e) {
    if (e instanceof PathError) throw new TaskError(400, `${name}: ${e.message}`);
    throw e;
  }
}

/** Шаблон на кадри: само `<папка под корена>/%0Nd.png`. */
async function patternPath(root: string, v: unknown): Promise<string> {
  const p = str(v, 'pattern');
  const name = basename(p.replace(/\\/g, '/'));
  if (!/^%0[1-9]d\.png$/.test(name)) throw new TaskError(400, 'pattern: само %0Nd.png');
  const dir = dirname(p.replace(/\\/g, '/'));
  try {
    const probe = await safeOutput(root, `${dir === '.' ? '' : `${dir}/`}probe.png`);
    return join(dirname(probe), name);
  } catch (e) {
    if (e instanceof PathError) throw new TaskError(400, `pattern: ${e.message}`);
    throw e;
  }
}

export async function buildArgv(
  task: string,
  params: TaskParams,
  ctx: { repoRoot: string; previewRoot: string },
): Promise<Command> {
  if (!(TASK_IDS as readonly string[]).includes(task)) throw new TaskError(400, 'непозната задача');
  const root = ctx.previewRoot;
  // Червеният екип на #515 (F5): cwd НЕ е папката на студиото — на Windows libuv търси голо име (ffmpeg)
  // първо в cwd, затова подхвърлен studio\\ffmpeg.exe печелеше пред PATH. Пътищата към студиото са абсолютни.
  const cwd = await realpath(ctx.repoRoot);
  const tool = (f: string) => join(ctx.repoRoot, 'tools', 'video', f);
  if (task === 'doctor')
    return { cmd: process.execPath, args: [tool('doctor.mjs'), '--json'], cwd };
  const wantsRun = params.run === true;
  const wantsForce = params.force === true;
  if ((wantsRun || wantsForce) && params.confirm !== true) {
    throw new TaskError(409, 'пускането и презаписът искат потвърждение', 'confirm');
  }
  const args = [tool('presets.mjs'), task];
  if (task === 'frames') {
    args.push('--pattern', await patternPath(root, params.pattern));
    if (params.audio !== undefined) args.push('--audio', await inPath(root, params.audio, 'audio'));
  } else {
    args.push('--in', await inPath(root, params.in, 'in'));
  }
  args.push('--out', await outPath(root, params.out, 'out'));
  if (wantsForce) args.push('--force');
  if (wantsRun) args.push('--run');
  return { cmd: process.execPath, args, cwd };
}

export interface Progress {
  frame?: number;
  time?: string;
}

/** Ходът на ffmpeg от stderr: `frame=  120 … time=00:00:02.00`. */
export function parseProgress(line: string): Progress | null {
  const f = /frame=\s*(\d+)/.exec(line);
  const t = /time=\s*(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(line);
  if (!f && !t) return null;
  const out: Progress = {};
  if (f) out.frame = Number(f[1]);
  if (t) out.time = t[1]!;
  return out;
}

export type TaskEvent =
  | { type: 'started'; pid: number | undefined }
  | { type: 'progress'; frame?: number; time?: string }
  | { type: 'line'; stream: 'out' | 'err'; text: string }
  | { type: 'done'; code: number | null };

type Spawn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; shell: false; windowsHide: true },
) => ChildProcess;

/** Убива дървото: на Windows taskkill /T /F, иначе групата на процеса. */
export function killTreeDefault(pid: number): void {
  if (process.platform === 'win32') {
    nodeSpawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true });
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* вече е спрял */
      }
    }
  }
}

export class TaskRunner {
  private child: ChildProcess | null = null;
  private readonly spawnFn: Spawn;
  private readonly killTree: (pid: number) => void;

  constructor(opts: { spawn?: Spawn; killTree?: (pid: number) => void } = {}) {
    this.spawnFn =
      opts.spawn ??
      ((cmd, args, o) => nodeSpawn(cmd, args, { ...o, detached: process.platform !== 'win32' }));
    this.killTree = opts.killTree ?? killTreeDefault;
  }

  get busy(): boolean {
    return this.child !== null;
  }

  start(c: Command, onEvent: (e: TaskEvent) => void): void {
    if (this.child) throw new TaskError(409, 'вече тече задача — изчакай или я спри', 'busy');
    const child = this.spawnFn(c.cmd, c.args, { cwd: c.cwd, shell: false, windowsHide: true });
    this.child = child;
    onEvent({ type: 'started', pid: child.pid });
    const feed = (stream: 'out' | 'err') => (buf: Buffer) => {
      for (const text of buf.toString('utf8').split(/\r|\n/)) {
        if (!text.trim()) continue;
        const p = parseProgress(text);
        if (p && stream === 'err') onEvent({ type: 'progress', ...p });
        else onEvent({ type: 'line', stream, text: text.slice(0, 2000) });
      }
    };
    child.stdout?.on('data', feed('out'));
    child.stderr?.on('data', feed('err'));
    const done = (code: number | null) => {
      if (this.child !== child) return;
      this.child = null;
      onEvent({ type: 'done', code });
    };
    child.on('close', done);
    child.on('error', () => done(-1));
  }

  stop(): boolean {
    const pid = this.child?.pid;
    if (!this.child || pid === undefined) return false;
    this.killTree(pid);
    return true;
  }
}
