// Критерий 9: дневният таван ($20) се пази на диска по дата; при 75% страницата предупреждава и не пуска
// нова работа; нов ден → от нула; повредено копие на диска → считаме таванa за изчерпан (fail closed).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DailyBudget, SpendMeter, PRICES, FALLBACK } from '../src/budget.js';
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

test('#515: без резултат — оценка от стъпките; оценката НЕ влиза в базата (по-добре отгоре, отколкото отдолу)', () => {
  const m = new SpendMeter();
  const run = m.startRun();
  run.onAssistant({ id: 'msg1', model: 'claude-sonnet-5-5', usage: u(1000, 100) });
  run.onAssistant({ id: 'msg1', model: 'claude-sonnet-5-5', usage: u(1000, 300) });
  run.onAssistant({ id: 'msg2', model: 'claude-opus-5-5', usage: u(0, 1000) });
  // sonnet: 1000×$2/M + 300×$10/M = 0.005 (дубълът на msg1 — веднъж, с най-големия изход); opus: 1000×$20/M = 0.02
  assert.equal(usd(run.estimate()), 0.025);
  assert.equal(usd(m.onEstimate('s1', run.estimate())), 0.025);
  // Втори преглед на #515 (AI-джията): сумите се пазят в транскрипта само при нормален изход — оценката не
  // намалява следващата делта; при съмнение броим два пъти, не нула.
  assert.equal(usd(m.onResult('s1', 0.125)), 0.125);
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

// Втори преглед на #515 (AI-джията): output_tokens в assistant съобщенията е заместител от message_start
// (code.claude.com/docs/en/agent-sdk/cost-tracking); истинският брой идва в message_delta на потока.
test('#515: изходът — от message_delta на потока; без него — по знаците на съдържанието, не по заместителя', () => {
  const m = new SpendMeter();
  const run = m.startRun();
  run.onStream(null, {
    type: 'message_start',
    message: { id: 'd1', model: 'claude-sonnet-5-5', usage: u(0, 1) },
  });
  run.onStream(null, { type: 'message_delta', usage: { output_tokens: 500 } });
  run.onAssistant({ id: 'd1', model: 'claude-sonnet-5-5', usage: u(0, 1) });
  assert.equal(usd(run.estimate()), 0.005, '500 изходни × $10/M');
  const sub = m.startRun();
  sub.onAssistant({ id: 's1', model: 'claude-opus-5-5', usage: u(0, 1) }, [
    { type: 'text', text: 'я'.repeat(2000) },
    { type: 'tool_use', input: { command: 'x'.repeat(986) } },
  ]);
  // (2000 + 1000 знака JSON) / 2 = 1500 токена × $20/M = 0.03
  assert.equal(usd(sub.estimate()), 0.03);
});

test('#515: моделът се познава точно; непознат → най-скъпият ред в prices.json', () => {
  const m = new SpendMeter();
  const near = m.startRun();
  near.onAssistant({ id: 'n', model: 'claude-opus-5-50', usage: u(0, 1000) });
  assert.equal(usd(near.estimate()), usd(FALLBACK.out / 1000), 'opus-5-50 не е opus-5-5');
  const dated = m.startRun();
  dated.onAssistant({ id: 'd', model: 'claude-opus-5-5-20261101', usage: u(0, 1000) });
  assert.equal(usd(dated.estimate()), 0.02, 'датирана версия на същия модел');
  const pj = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', 'tools', 'agents', 'prices.json'), 'utf8'),
  ) as { models: { in: number; out: number }[] };
  assert.equal(FALLBACK.out, Math.max(...pj.models.map((x) => x.out)));
  assert.equal(FALLBACK.in, Math.max(...pj.models.map((x) => x.in)));
});

test('#515: повреден spend.json остава блокиран и след add (не се презаписва с малка сума)', () => {
  const own = mkdtempSync(join(tmpdir(), 'pult-corrupt-'));
  after(() => rmSync(own, { recursive: true, force: true }));
  const f = join(own, 'corrupt-add.json');
  writeFileSync(f, '{не е json');
  const b = new DailyBudget({ file: f, dailyUsd: 20, now: day('2026-11-28') });
  b.add(0.5);
  assert.equal(b.status().blocked, true);
  assert.equal(readFileSync(f, 'utf8'), '{не е json', 'файлът е непокътнат — за човешки поглед');
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
    async *run(prompt: string, options: { abortController?: AbortController }) {
      if (prompt.includes('спри ме')) {
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
        total_cost_usd: 0.5,
        session_id: 'aaaaaaaa-1111',
        is_error: false,
        result: '',
      } as never;
    },
  } as never,
});
after(() => p2.close());

test('#515 HTTP: спрян разговор без резултат влиза в тавана по оценка', async () => {
  const before = p2.deps.budget.status().spent;
  let r: Response | undefined;
  for (let i = 0; i < 50; i++) {
    r = await post(p2, '/api/chat', { agent: 'ai-studio', text: 'спри ме' });
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
