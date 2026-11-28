// Критерии 3–4: еднократен токен → API токен във фрагмента (#t=…, без бисквитка); повторно → 401; без токен → 401;
// токенът и ключът не стигат до нито един отговор, лог или файл в public/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SessionGate } from '../src/http/guard.js';
import { startTestServer, post, get, FAKE_KEY } from './helpers.js';

test('SessionGate: токенът е 32 байта, важи веднъж; API токенът се проверява с постоянно време', () => {
  const g = new SessionGate();
  assert.match(g.startToken, /^[A-Za-z0-9_-]{43}$/, '32 байта в base64url');
  assert.equal(g.exchange('грешен'), null);
  const t = g.exchange(g.startToken);
  assert.ok(t);
  assert.equal(g.exchange(g.startToken), null, 'втори път — не');
  assert.equal(g.valid(`Bearer ${t}`), true);
  assert.equal(g.valid(`bearer ${t}`), false, 'точната схема');
  assert.equal(g.valid(t), false);
  assert.equal(g.valid('Bearer друго'), false);
  assert.equal(g.valid(undefined), false);
});

const p = await startTestServer();
after(() => p.close());

test('отваряне без токен или с грешен → 401', async () => {
  assert.equal((await fetch(`${p.base}/`, { redirect: 'manual' })).status, 401);
  assert.equal((await fetch(`${p.base}/?k=abc`, { redirect: 'manual' })).status, 401);
});

test('токенът вече е използван (helpers го размениха) → 401', async () => {
  assert.equal(
    (await fetch(`${p.base}/?k=${p.deps.gate.startToken}`, { redirect: 'manual' })).status,
    401,
  );
});

// Червеният екип на #515 (F2): бисквитка от 127.0.0.1:A стига и до 127.0.0.1:B (не се делят по порт) →
// всеки друг локален слушател я получава. API токенът е във фрагмента — той никога не стига до сървър.
test('размяната връща 303 към /app#t=… и не слага бисквитка', async () => {
  const { createPult } = await import('../src/server.js');
  const g = new SessionGate();
  const server = createPult({ ...p.deps, gate: g });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/?k=${g.startToken}`, { redirect: 'manual' });
    assert.equal(res.status, 303);
    assert.match(res.headers.get('location') ?? '', /^\/app#t=[A-Za-z0-9_-]{43}$/);
    assert.equal(res.headers.get('set-cookie'), null, 'без бисквитка');
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('API без токен → 401; само бисквитка (старата сесия) → 401; с Bearer → 200', async () => {
  assert.equal((await fetch(`${p.base}/api/agents`)).status, 401);
  const t = p.auth.slice('Bearer '.length);
  assert.equal(
    (await fetch(`${p.base}/api/agents`, { headers: { cookie: `pult=${t}` } })).status,
    401,
  );
  assert.equal((await get(p, '/api/agents')).status, 200);
  assert.equal((await fetch(`${p.base}/api/events`)).status, 401, 'и потокът на събитията');
  const r = await fetch(`${p.base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: p.origin, cookie: `pult=${t}` },
    body: JSON.stringify({ agent: 'ai-studio', text: 'x' }),
  });
  assert.equal(r.status, 401);
});

test('страницата и скриптът се дават без токен — в тях няма тайни', async () => {
  for (const path of ['/app', '/app.js', '/app.css']) {
    assert.equal((await fetch(`${p.base}${path}`)).status, 200, path);
  }
  assert.equal(
    (await fetch(`${p.base}/app`, { headers: { 'sec-fetch-site': 'cross-site' } })).status,
    403,
    'от чужд сайт — не',
  );
});

test('ключът и токенът ги няма в отговорите, лога и public/', async () => {
  const bodies: string[] = [];
  for (const path of ['/app', '/api/agents', '/api/budget', '/app.js', '/app.css']) {
    const r = await get(p, path);
    bodies.push(await r.text(), JSON.stringify([...r.headers]));
  }
  bodies.push(await (await post(p, '/api/task', { task: 'nema' })).text());
  const all = bodies.join('\n') + p.logs.join('\n');
  assert.equal(all.includes(FAKE_KEY), false, 'ключът изтече');
  assert.equal(all.includes(p.deps.gate.startToken), false, 'токенът изтече');
  const pub = join(import.meta.dirname, '..', 'public');
  for (const f of readdirSync(pub)) {
    assert.doesNotMatch(readFileSync(join(pub, f), 'utf8'), /sk-ant-/, f);
  }
});

test('изход от пулта спира работещия агент (без сираци — живата проба оставяше процеса на SDK жив)', async () => {
  let aborted = false;
  const runner = {
    async *run(_prompt: string, options: { abortController?: AbortController }) {
      yield {
        type: 'stream_event',
        parent_tool_use_id: null,
        session_id: 's',
        uuid: 'u',
        event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '…' } },
      } as never;
      await new Promise<void>((res) =>
        options.abortController!.signal.addEventListener('abort', () => {
          aborted = true;
          res();
        }),
      );
    },
  };
  const s = await startTestServer({ runner: runner as never });
  try {
    assert.equal((await post(s, '/api/chat', { agent: 'ai-studio', text: 'работи' })).status, 202);
    await new Promise((r) => setTimeout(r, 50));
    (s.server as unknown as { shutdown(): void }).shutdown();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(aborted, true);
  } finally {
    s.close();
  }
});
