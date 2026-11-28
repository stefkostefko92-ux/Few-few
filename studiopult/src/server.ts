/**
 * Студио пулт — HTTP сървърът (node:http, без рамка). Слуша само на 127.0.0.1 (index.ts). Всяка заявка минава
 * през пазача: Host → 421, бисквитка → 401, GET от чужд сайт → 403, POST без точния Origin → 403, тяло само
 * JSON до 64 KB. Събитията (текст от агента, одобрения, ход на рендера) отиват към страницата по SSE.
 * Текстът на агента е ДАННИ — страницата го рисува с textContent, никога като HTML.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { hostOk, originOk, fetchSiteOk, SECURITY_HEADERS, type SessionGate } from './http/guard.js';
import { safeResolve, contentTypeOf, PathError } from './files.js';
import { buildArgv, TaskError, type TaskRunner } from './tasks.js';
import { makeCanUseTool, type Approvals } from './approvals.js';
import type { DailyBudget } from './budget.js';
import { buildOptions, toUiEvent, type AgentRunner } from './agent.js';

export interface PultDeps {
  repoRoot: string;
  previewRoot: string;
  gate: SessionGate;
  runner: AgentRunner;
  approvals: Approvals;
  budget: DailyBudget;
  tasks: TaskRunner;
  agents: string[];
  key: string;
  log?: (line: string) => void;
  selfCheck?: () => Promise<{ ok: boolean; detail: string }>;
}

const SESSION = 'owner';
const MAX_BODY = 64 * 1024;
const PUBLIC: Record<string, [string, string]> = {
  '/app': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'error',
  ) {
    super(message);
  }
}

export function createPult(deps: PultDeps): Server & { shutdown(): void } {
  const publicDir = join(import.meta.dirname, '..', 'public');
  const clients = new Set<ServerResponse>();
  let chat: AbortController | null = null;
  const redact = (s: string) => (deps.key ? s.split(deps.key).join('[ключ]') : s);
  const log = (line: string) => deps.log?.(redact(line));

  const broadcast = (e: unknown) => {
    const data = `data: ${redact(JSON.stringify(e))}\n\n`;
    for (const c of clients) c.write(data);
  };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(redact(JSON.stringify(body)));
  };

  async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    const ct = String(req.headers['content-type'] ?? '')
      .split(';')[0]!
      .trim()
      .toLowerCase();
    if (ct !== 'application/json') throw new HttpError(415, 'тялото трябва да е JSON');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > MAX_BODY) throw new HttpError(413, 'твърде голямо тяло');
      chunks.push(c as Buffer);
    }
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
      return v as Record<string, unknown>;
    } catch {
      throw new HttpError(400, 'невалиден JSON');
    }
  }

  function serveFile(res: ServerResponse, real: string, range: string | undefined) {
    const size = statSync(real).size;
    const type = contentTypeOf(real);
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : size - Number(m[2]);
      let end = m[1] && m[2] ? Number(m[2]) : size - 1;
      start = Math.max(0, start);
      end = Math.min(size - 1, end);
      if (start > end) {
        res.writeHead(416, { 'content-range': `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'content-type': type,
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
      });
      createReadStream(real, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
    createReadStream(real).pipe(res);
  }

  async function startChat(body: Record<string, unknown>) {
    if (deps.budget.status().blocked)
      throw new HttpError(429, 'дневният таван е достигнат', 'budget');
    const agent = body.agent;
    const text = body.text;
    if (typeof agent !== 'string' || !deps.agents.includes(agent))
      throw new HttpError(400, 'непознат агент');
    if (typeof text !== 'string' || !text.trim() || text.length > 20_000)
      throw new HttpError(400, 'празно или твърде дълго съобщение');
    if (chat) throw new HttpError(409, 'агентът още работи — изчакай или спри', 'busy');
    const resume =
      typeof body.resume === 'string' && /^[0-9a-f-]{8,64}$/i.test(body.resume)
        ? body.resume
        : undefined;
    const ac = new AbortController();
    chat = ac;
    const canUseTool = makeCanUseTool({
      approvals: deps.approvals,
      session: SESSION,
      agentName: agent,
      emit: broadcast,
    });
    const opts = buildOptions({
      agentId: agent,
      agents: deps.agents,
      repoRoot: deps.repoRoot,
      key: deps.key,
      canUseTool,
      abortController: ac,
      ...(resume ? { resume } : {}),
    });
    broadcast({ type: 'chat-start', agent });
    void (async () => {
      try {
        for await (const m of deps.runner.run(text, opts)) {
          const e = toUiEvent(m);
          if (!e) continue;
          if (e.type === 'result' && e.cost > 0) deps.budget.add(e.cost);
          broadcast(e);
        }
      } catch (err) {
        broadcast({
          type: 'error',
          message: redact(String((err as Error)?.message ?? err)).slice(0, 500),
        });
      } finally {
        deps.approvals.cancelAll(SESSION);
        if (chat === ac) chat = null;
        broadcast({ type: 'chat-end', budget: deps.budget.status() });
      }
    })();
  }

  async function route(req: IncomingMessage, res: ServerResponse, port: number) {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const path = url.pathname;
    log(`${req.method} ${path}`); // без query: токенът и пътищата не влизат в лога

    if (req.method === 'GET' && path === '/') {
      const value = deps.gate.exchange(url.searchParams.get('k'));
      if (!value) {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Студио пулт: отвори адреса с ключа, който е отпечатан в терминала при старта.');
        return;
      }
      res.writeHead(303, { location: '/app', 'set-cookie': deps.gate.setCookie(value) });
      res.end();
      return;
    }
    if (!deps.gate.valid(req.headers.cookie))
      throw new HttpError(401, 'няма сесия — отвори адреса от терминала');

    if (req.method === 'GET') {
      if (!fetchSiteOk(req.headers['sec-fetch-site'] as string | undefined))
        throw new HttpError(403, 'чужд сайт');
      const pub = PUBLIC[path];
      if (pub) {
        res.writeHead(200, { 'content-type': pub[1] });
        res.end(readFileSync(join(publicDir, pub[0])));
        return;
      }
      if (path === '/api/agents')
        return send(res, 200, {
          agents: deps.agents,
          default: deps.agents.includes('ai-studio') ? 'ai-studio' : deps.agents[0],
        });
      if (path === '/api/budget') return send(res, 200, deps.budget.status());
      if (path === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          connection: 'keep-alive',
        });
        res.write(': пулт\n\n');
        clients.add(res);
        const beat = setInterval(() => res.write(': жив\n\n'), 25_000);
        beat.unref?.();
        req.on('close', () => {
          clearInterval(beat);
          clients.delete(res);
        });
        return;
      }
      if (path === '/api/file') {
        try {
          const real = await safeResolve(deps.previewRoot, url.searchParams.get('path') ?? '');
          serveFile(res, real, req.headers.range);
        } catch (e) {
          if (e instanceof PathError) throw new HttpError(400, e.message);
          throw e;
        }
        return;
      }
      throw new HttpError(404, 'няма такава страница');
    }

    if (req.method === 'POST') {
      if (!originOk(req.headers.origin, port)) throw new HttpError(403, 'чужд или липсващ Origin');
      const body = await readJson(req);
      if (path === '/api/chat') {
        await startChat(body);
        return send(res, 202, { ok: true });
      }
      if (path === '/api/chat/stop') {
        chat?.abort();
        deps.approvals.cancelAll(SESSION);
        return send(res, 200, { ok: true });
      }
      if (path === '/api/approve') {
        if (typeof body.requestId !== 'string' || typeof body.allow !== 'boolean')
          throw new HttpError(400, 'requestId и allow');
        const r = deps.approvals.decide(SESSION, body.requestId, body.allow);
        if (r === 'not_found') throw new HttpError(404, 'няма такова чакащо одобрение');
        return send(res, 200, { ok: true });
      }
      if (path === '/api/task') {
        try {
          const cmd = await buildArgv(String(body.task ?? ''), body, {
            repoRoot: deps.repoRoot,
            previewRoot: deps.previewRoot,
          });
          deps.tasks.start(cmd, (e) =>
            broadcast({ ...e, type: `task-${e.type}`, task: body.task }),
          );
        } catch (e) {
          if (e instanceof TaskError) throw new HttpError(e.status, e.message, e.code);
          throw e;
        }
        return send(res, 202, { ok: true });
      }
      if (path === '/api/task/stop') return send(res, 200, { stopped: deps.tasks.stop() });
      if (path === '/api/selfcheck') {
        if (!deps.selfCheck) throw new HttpError(501, 'самопроверката не е налична');
        return send(res, 200, await deps.selfCheck());
      }
      throw new HttpError(404, 'няма такъв адрес');
    }
    throw new HttpError(405, 'методът не е позволен');
  }

  const server = createServer((req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const port = (server.address() as AddressInfo).port;
    if (!hostOk(req.headers.host, port)) {
      res.writeHead(421, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('грешен Host');
      return;
    }
    route(req, res, port).catch((e: unknown) => {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) log(`грешка: ${String((e as Error)?.message ?? e)}`);
      if (res.headersSent) return res.end();
      send(res, status, {
        error: e instanceof HttpError ? e.message : 'вътрешна грешка',
        code: e instanceof HttpError ? e.code : 'error',
      });
    });
  });
  // Изход от пулта (Ctrl+C, затворен терминал): спира агента и рендера — живата проба оставяше процеса на
  // SDK жив след спрения сървър (сирак, който харчи).
  return Object.assign(server, {
    shutdown(): void {
      chat?.abort();
      deps.approvals.cancelAll(SESSION);
      deps.tasks.stop();
      for (const c of clients) c.end();
      clients.clear();
    },
  });
}

export type PultServer = Server & { shutdown(): void };
