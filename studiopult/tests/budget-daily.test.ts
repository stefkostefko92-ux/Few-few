// Критерий 9: дневният таван ($20) се пази на диска по дата; при 75% страницата предупреждава и не пуска
// нова работа; нов ден → от нула; повредено копие на диска → считаме таванa за изчерпан (fail closed).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DailyBudget } from '../src/budget.js';
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
    await fetch(`${p.base}/api/budget`, { headers: { cookie: p.cookie } })
  ).json()) as { blocked: boolean };
  assert.equal(st.blocked, true);
});
