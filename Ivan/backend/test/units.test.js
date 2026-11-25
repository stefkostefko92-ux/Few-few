"use strict";
// Без база: ограничението на опитите, конфигурацията, хешът на ПИН-а.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createLoginLimiter } = require("../src/limiter");
const { loadConfig } = require("../src/config");
const { hashPin, verifyPin, isPinHash } = require("../src/security");

test("заключването се удвоява и успешният вход го нулира", () => {
  let t = 0;
  const l = createLoginLimiter({ now: () => t });
  for (let i = 0; i < 4; i++) l.fail("a@x", "1.1.1.1");
  assert.equal(l.check("a@x", "1.1.1.1").ok, true);
  l.fail("a@x", "1.1.1.1");
  assert.equal(l.check("a@x", "1.1.1.1").retryAfterSec, 15 * 60);
  t += 15 * 60 * 1000;
  assert.equal(l.check("a@x", "1.1.1.1").ok, true);
  for (let i = 0; i < 5; i++) l.fail("a@x", "2.2.2.2");
  assert.equal(l.check("a@x", "2.2.2.2").retryAfterSec, 30 * 60);
  t += 30 * 60 * 1000;
  l.succeed("a@x");
  for (let i = 0; i < 5; i++) l.fail("a@x", "3.3.3.3");
  assert.equal(l.check("a@x", "3.3.3.3").retryAfterSec, 15 * 60);
});

test("един адрес не пробва много акаунти", () => {
  const l = createLoginLimiter({ now: () => 0 });
  for (let i = 0; i < 30; i++) l.fail(`user${i}@x`, "9.9.9.9");
  assert.equal(l.check("fresh@x", "9.9.9.9").ok, false);
  assert.equal(l.check("fresh@x", "8.8.8.8").ok, true);
});

test("конфигурацията отказва липсващ или къс ключ", () => {
  const base = { DATABASE_URL: "postgresql://u:p@h/db" };
  assert.throws(() => loadConfig(base), /JWT_SECRET/);
  assert.throws(() => loadConfig({ ...base, JWT_SECRET: "dev-secret" }), /32/);
  const ok = loadConfig({ ...base, JWT_SECRET: "x".repeat(64), NODE_ENV: "production", TRUST_PROXY: "2" });
  assert.equal(ok.secureCookies, true);
  assert.equal(ok.trustProxy, 2);
});

test("ПИН в чист вид в базата не пуска никого", async () => {
  assert.equal(await verifyPin("1234", "1234"), false);
  const h = await hashPin("1234");
  assert.equal(isPinHash(h), true);
  assert.equal(await verifyPin("1234", h), true);
  assert.equal(await verifyPin("4321", h), false);
});
