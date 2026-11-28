// Общото за тестовете: пулт на случаен порт с фалшив runner (без мрежа и без ключ), временни папки.
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createPult, type PultDeps } from '../src/server.js';
import { SessionGate } from '../src/http/guard.js';
import { Approvals } from '../src/approvals.js';
import { DailyBudget } from '../src/budget.js';
import { TaskRunner } from '../src/tasks.js';
import type { AgentRunner } from '../src/agent.js';

/** Ключ, сглобен по време на теста — никога литерал в репото. */
export const FAKE_KEY = ['sk', 'ant', 'api03', 'x'.repeat(48)].join('-');

/** Runner, който връща подадените съобщения (форма като на SDK) и пази опциите, с които е викан. */
export function fakeRunner(
  messages: unknown[],
): AgentRunner & { calls: { prompt: string; options: unknown }[] } {
  const calls: { prompt: string; options: unknown }[] = [];
  return {
    calls,
    async *run(prompt, options) {
      calls.push({ prompt, options });
      for (const m of messages) yield m as never;
    },
  };
}

export interface TestPult {
  server: Server;
  port: number;
  base: string;
  origin: string;
  /** `Bearer …` — API токенът от фрагмента `/app#t=…` (бисквитка няма: тя стига и до други портове). */
  auth: string;
  dir: string;
  preview: string;
  logs: string[];
  deps: PultDeps;
  close(): void;
}

export async function startTestServer(over: Partial<PultDeps> = {}): Promise<TestPult> {
  const dir = mkdtempSync(join(tmpdir(), 'pult-'));
  const preview = join(dir, 'studio');
  mkdirSync(preview);
  const logs: string[] = [];
  const deps: PultDeps = {
    repoRoot: join(import.meta.dirname, '..', '..'),
    previewRoot: preview,
    dataDir: join(dir, 'data'),
    gate: new SessionGate(),
    runner: fakeRunner([]),
    approvals: new Approvals({ timeoutMs: 2000 }),
    budget: new DailyBudget({ file: join(dir, 'spend.json'), dailyUsd: 20 }),
    tasks: new TaskRunner(),
    agents: ['ai-studio', 'seo'],
    key: FAKE_KEY,
    log: (l) => logs.push(l),
    ...over,
  };
  const server = createPult(deps);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const res = await fetch(`${base}/?k=${deps.gate.startToken}`, { redirect: 'manual' });
  const t = /^\/app#t=([A-Za-z0-9_-]{43})$/.exec(res.headers.get('location') ?? '')?.[1];
  if (!t) throw new Error('размяната не върна токен във фрагмента');
  const auth = `Bearer ${t}`;
  return {
    server,
    port,
    base,
    origin: base,
    auth,
    dir,
    preview,
    logs,
    deps,
    close() {
      server.closeAllConnections();
      server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** POST с правилния Origin и бисквитката. */
export function post(p: TestPult, path: string, body: unknown): Promise<Response> {
  return fetch(`${p.base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: p.origin, authorization: p.auth },
    body: JSON.stringify(body),
  });
}

/** GET с токена. */
export function get(
  p: TestPult,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${p.base}${path}`, { headers: { authorization: p.auth, ...headers } });
}

/** Подписан адрес за прегледа (`<video src>` не праща заглавия). */
export async function fileUrl(p: TestPult, rel: string): Promise<string> {
  const r = await get(p, `/api/file-link?path=${encodeURIComponent(rel)}`);
  if (r.status !== 200) throw new Error(`file-link ${r.status}`);
  return ((await r.json()) as { url: string }).url;
}
