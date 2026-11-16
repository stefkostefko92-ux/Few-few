import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  createRateLimiter,
  MAX_WINDOW_MS,
  SWEEP_EVERY_MS,
} from "@/lib/ratelimit-core";

const MIN = 60 * 1000;

test("блокира след max заявки в прозореца и пуска отново след него", () => {
  const rl = createRateLimiter();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rl.hit("a", 3, 10 * MIN, t0 + i), true);
  assert.equal(rl.hit("a", 3, 10 * MIN, t0 + 5), false);
  assert.equal(rl.hit("a", 3, 10 * MIN, t0 + 10 * MIN + 10), true);
});

test("изтеклите IP записи се чистят по време, дори при малък трафик", () => {
  const rl = createRateLimiter();
  const t0 = 1_000_000;
  rl.hit("contact:1.2.3.4", 6, 10 * MIN, t0);
  assert.equal(rl.has("contact:1.2.3.4"), true);
  // Друга заявка след прозореца + интервала на чистене → старият запис изчезва.
  rl.hit("other", 6, 10 * MIN, t0 + 10 * MIN + SWEEP_EVERY_MS);
  assert.equal(rl.has("contact:1.2.3.4"), false);
});

test("таймерът чисти IP записите и без нито една нова заявка (нощем)", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let now = 1_000_000;
  const rl = createRateLimiter(SWEEP_EVERY_MS, { clock: () => now });
  const tick = (ms: number) => {
    for (let left = ms; left > 0; left -= SWEEP_EVERY_MS) {
      now += SWEEP_EVERY_MS;
      t.mock.timers.tick(SWEEP_EVERY_MS);
    }
  };
  rl.hit("contact:1.2.3.4", 6, 10 * MIN, now);
  rl.hit("login:5.6.7.8", 8, MAX_WINDOW_MS, now);
  // Прозорецът още тече → записите стоят (защитата не отслабва).
  tick(9 * MIN);
  assert.equal(rl.has("contact:1.2.3.4"), true);
  // Само времето минава — нула заявки — и записът с 10-минутен прозорец изчезва.
  tick(2 * MIN);
  assert.equal(rl.has("contact:1.2.3.4"), false);
  assert.equal(rl.has("login:5.6.7.8"), true);
  // Най-дългият прозорец + един интервал — пак под обещаните 20 минути.
  tick(MAX_WINDOW_MS + SWEEP_EVERY_MS - 11 * MIN);
  assert.equal(rl.has("login:5.6.7.8"), false);
  assert.equal(rl.size(), 0);
  rl.stop();
});

test("без таймер (timer:false) чистенето е само при заявка", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const rl = createRateLimiter(SWEEP_EVERY_MS, { timer: false });
  rl.hit("a:1.2.3.4", 6, MIN, 1_000_000);
  t.mock.timers.tick(30 * MIN);
  assert.equal(rl.has("a:1.2.3.4"), true);
  rl.hit("b", 6, MIN, 1_000_000 + 30 * MIN);
  assert.equal(rl.has("a:1.2.3.4"), false);
});

test("кратък прозорец (търсене) НЕ трие записите на дълъг (вход)", () => {
  const rl = createRateLimiter();
  const t0 = 1_000_000;
  for (let i = 0; i < 8; i++) rl.hit("login:ip", 8, 15 * MIN, t0 + i);
  // 6 минути по-късно: търсенето (5 мин) пуска чистене.
  rl.hit("search:ip", 60, 5 * MIN, t0 + 6 * MIN);
  assert.equal(rl.has("login:ip"), true);
  assert.equal(rl.hit("login:ip", 8, 15 * MIN, t0 + 6 * MIN + 1), false);
});

test("никой прозорец в приложението не надвишава MAX_WINDOW_MS (обещанието „до 20 минути“)", () => {
  assert.ok(MAX_WINDOW_MS + SWEEP_EVERY_MS <= 20 * MIN);
  const src = join(process.cwd(), "src");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(n)) files.push(p);
    }
  };
  walk(src);
  let calls = 0;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/rateLimit\(\s*await clientKey\([^)]*\)\s*(?:,\s*\d+\s*,\s*([^)]+))?\)/g)) {
      calls++;
      if (!m[1]) continue; // по подразбиране: 10 мин
      const ms = Function(`"use strict"; return (${m[1]});`)() as number;
      assert.ok(ms <= MAX_WINDOW_MS, `${f}: прозорец ${ms} ms > ${MAX_WINDOW_MS}`);
    }
  }
  assert.ok(calls >= 10, `намерени само ${calls} извиквания — регулярният израз е остарял`);
});
