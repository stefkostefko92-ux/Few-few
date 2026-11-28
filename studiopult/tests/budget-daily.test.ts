// Критерий 9: дневният таван ($20) се пази на диска по дата; при 75% страницата предупреждава и не пуска
// нова работа; нов ден → от нула; повредено копие на диска → считаме таванa за изчерпан (fail closed).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DailyBudget, SpendMeter, PRICES } from '../src/budget.js';
import { startTestServer, post } from './helpers.js';

const dir = mkdtempSync(join(tmpdir(), 'pult-budget-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const day = (d: string) => () => new Date(`${d}T12:00:00`);

test('под 75% — свободно; от 75% — предупреждение и спиране', () => {
  const b = new DailyBudget({ file: join(dir, 'a.json'), dailyUsd: 20, now: day('2026-11-28') });
  b.add(10);
  assert.deepEqual(b.status(), { spent: 10, limit: 20, warn: false, blocked: false });
  b.add(5);
  assert.deepEqual(b.status(), { spent: 15, limit: 20, warn: true, blocked: true });
});

test('пази се на диска и се чете отново; нов ден започва от нула', () => {
  const f = join(dir, 'b.json');
  new DailyBudget({ file: f, dailyUsd: 20, now: day('2026-11-28') }).add(7.5);
  assert.equal(
    new DailyBudget({ file: f, dailyUsd: 20, now: day('2026-11-28') }).status().spent,
    7.5,
  );
  assert.equal(
    new DailyBudget({ file: f, dailyUsd: 20, now: day('2026-11-29') }).status().spent,
    0,
  );
});

test('повреден файл или отрицателна сума → изчерпан (fail closed)', () => {
  const f = join(dir, 'c.json');
  writeFileSync(f, '{не е json');
  assert.equal(
    new DailyBudget({ file: f, dailyUsd: 20, now: day('2026-11-28') }).status().blocked,
    true,
  );
  const b = new DailyBudget({ file: join(dir, 'd.json'), dailyUsd: 20, now: day('2026-11-28') });
  assert.throws(() => b.add(-5));
  assert.throws(() => b.add(Number.NaN));
});

const p = await startTestServer();
after(() => p.close());

test('HTTP: при изчерпан дневен таван чатът връща 429 и не вика агента', async () => {
  p.deps.budget.add(16);
  const r = await post(p, '/api/chat', { agent: 'ai-studio', text: 'здравей' });
  assert.equal(r.status, 429);
  const st = (await (
    await fetch(`${p.base}/api/budget`, { headers: { authorization: p.auth } })
  ).json()) as { blocked: boolean };
  assert.equal(st.blocked, true);
});

// Прегледът на #515: total_cost_usd при продължен разговор носи и предишния разход на сесията
// (code.claude.com/docs/en/agent-sdk/cost-tracking: „A resumed call’s results report the session’s whole
// spend“) — сумирането броеше двойно; спрян или сринал се разговор без резултат не се броеше изобщо.
const usd = (x: number) => Math.round(x * 1e6) / 1e6;
const u = (input: number, output: number) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
});

test('#515: SpendMeter брои делтата на сесията, не целия ѝ разход', () => {
  const m = new SpendMeter();
  assert.equal(usd(m.onResult('s1', 0.5)), 0.5);
  assert.equal(usd(m.onResult('s1', 0.8)), 0.3, 'продължението — само новото');
  assert.equal(usd(m.onResult('s2', 0.2)), 0.2, 'друга сесия — отделно');
  assert.equal(usd(m.onResult('s1', 0.7)), 0, 'по-малка сума не връща пари');
});

test('#515: без резултат — оценка от стъпките; оценката влиза в базата, за да не се брои пак', () => {
  const m = new SpendMeter();
  const run = m.startRun();
  run.onAssistant({ id: 'msg1', model: 'claude-sonnet-5-5', usage: u(1000, 100) });
  run.onAssistant({ id: 'msg1', model: 'claude-sonnet-5-5', usage: u(1000, 300) });
  run.onAssistant({ id: 'msg2', model: 'claude-opus-5-5', usage: u(0, 1000) });
  // sonnet: 1000×$2/M + 300×$10/M = 0.005 (дубълът на msg1 — веднъж, с най-големия изход); opus: 1000×$20/M = 0.02
  assert.equal(usd(run.estimate()), 0.025);
  assert.equal(usd(m.onEstimate('s1', run.estimate())), 0.025);
  // Продължението отчита целия разход на сесията (0.025 от спрения + 0.1 нов) → влиза само 0.1.
  assert.equal(usd(m.onResult('s1', 0.125)), 0.1);
  const unknown = m.startRun();
  unknown.onAssistant({ id: 'm', model: 'нов-модел', usage: u(0, 1000) });
  assert.equal(
    usd(unknown.estimate()),
    0.04,
    'непознат модел → най-високата цена в таблицата (fable-5-2: $40/M)',
  );
  const cached = m.startRun();
  cached.onAssistant({
    id: 'c',
    model: 'claude-sonnet-5-5',
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1e6,
      cache_creation_input_tokens: 1e6,
    },
  });
  // четене 1M × $0.1 (sonnet-5-5 има собствена цена за кеш-четене в prices.json); запис 1M × $2 × 2
  // (1-часовият — по-скъпият, fail closed) = 4
  assert.equal(usd(cached.estimate()), 4.1);
});

test('#515: таблицата с цени е същата като tools/agents/prices.json (един източник)', () => {
  const pj = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', 'tools', 'agents', 'prices.json'), 'utf8'),
  ) as {
    cache: { read: number; write1h: number };
    models: { id: string; in: number; out: number; cacheRead?: number }[];
  };
  for (const [id, pr] of Object.entries(PRICES)) {
    const row = pj.models.find((x) => x.id === id);
    assert.ok(row, `${id} липсва в prices.json`);
    assert.equal(pr.in, row.in, `${id} вход`);
    assert.equal(pr.out, row.out, `${id} изход`);
    assert.equal(pr.cacheRead, row.cacheRead ?? row.in * pj.cache.read, `${id} кеш-четене`);
    assert.equal(pr.cacheWrite, row.in * pj.cache.write1h, `${id} кеш-запис`);
  }
});

const p2 = await startTestServer({
  runner: {
    async *run(_prompt: string, options: { resume?: string; abortController?: AbortController }) {
      const sid = 'aaaaaaaa-1111';
      if (options.resume === 'bbbbbbbb-2222') {
        yield {
          type: 'assistant',
          parent_tool_use_id: 'x',
          session_id: 'bbbbbbbb-2222',
          uuid: 'a',
          message: { id: 'q', model: 'claude-sonnet-5-5', content: [], usage: u(0, 1000) },
        } as never;
        await new Promise<void>((r) =>
          options.abortController!.signal.addEventListener('abort', () => r()),
        );
        return;
      }
      yield {
        type: 'result',
        subtype: 'success',
        total_cost_usd: options.resume ? 0.8 : 0.5,
        session_id: sid,
        is_error: false,
        result: '',
      } as never;
    },
  } as never,
});
after(() => p2.close());

test('#515 HTTP: продължен разговор не брои разхода два пъти', async () => {
  assert.equal((await post(p2, '/api/chat', { agent: 'ai-studio', text: 'първо' })).status, 202);
  for (let i = 0; i < 50 && p2.deps.budget.status().spent === 0; i++)
    await new Promise((r) => setTimeout(r, 10));
  for (let i = 0; i < 50; i++) {
    const r = await post(p2, '/api/chat', {
      agent: 'ai-studio',
      text: 'второ',
      resume: 'aaaaaaaa-1111',
    });
    if (r.status === 202) break;
    await new Promise((res) => setTimeout(res, 10));
  }
  for (let i = 0; i < 50 && p2.deps.budget.status().spent < 0.8; i++)
    await new Promise((r) => setTimeout(r, 10));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(usd(p2.deps.budget.status().spent), 0.8);
});

test('#515 HTTP: спрян разговор без резултат влиза в тавана по оценка', async () => {
  const before = p2.deps.budget.status().spent;
  let r: Response | undefined;
  for (let i = 0; i < 50; i++) {
    r = await post(p2, '/api/chat', {
      agent: 'ai-studio',
      text: 'спри ме',
      resume: 'bbbbbbbb-2222',
    });
    if (r.status === 202) break;
    await new Promise((res) => setTimeout(res, 10));
  }
  assert.equal(r?.status, 202);
  await new Promise((res) => setTimeout(res, 30));
  await post(p2, '/api/chat/stop', {});
  for (let i = 0; i < 50 && p2.deps.budget.status().spent === before; i++)
    await new Promise((res) => setTimeout(res, 10));
  assert.equal(usd(p2.deps.budget.status().spent - before), 0.01, 'sonnet 1000 изходни = $0.01');
});

test('#515 HTTP: грешка при опциите не оставя чата зает', async () => {
  const s = await startTestServer({ agents: ['ai-studio', 'pult-dispatch'] });
  try {
    assert.equal((await post(s, '/api/chat', { agent: 'pult-dispatch', text: 'x' })).status, 400);
    assert.equal((await post(s, '/api/chat', { agent: 'ai-studio', text: 'x' })).status, 202);
  } finally {
    s.close();
  }
});
