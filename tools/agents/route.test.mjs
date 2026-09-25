// route.test.mjs — рутингът по задача класифицира правилно (CI auto-discover). Пуска CLI-то.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ROUTE = join(dirname(fileURLToPath(import.meta.url)), "route.mjs");
const route = (task) => JSON.parse(execFileSync("node", [ROUTE, "--json", task], { encoding: "utf8" }));

test("рисково/дълбоко → opus + high", () => {
  for (const t of ["провери за SQL injection в checkout webhook", "мигрирай Prisma схемата", "фискален бон и сторно"]) {
    const r = route(t);
    assert.equal(r.model, "opus", t);
    assert.equal(r.effort, "high", t);
  }
});

test("механично/шаблонно → sonnet + low", () => {
  for (const t of ["преведи етикета на италиански", "напиши changelog за релийза", "добави seed за аптеките"]) {
    const r = route(t);
    assert.equal(r.model, "sonnet", t);
    assert.equal(r.effort, "low", t);
  }
});

test("стандартна задача → sonnet + medium; никога Haiku", () => {
  const r = route("добави нова карта в дашборда");
  assert.equal(r.model, "sonnet");
  assert.equal(r.effort, "medium");
  // Инвариант: рутингът никога не връща haiku (решение на собственика).
  for (const t of ["каквото и да е", "SQL injection", "превод"]) assert.notEqual(route(t).model, "haiku");
});
