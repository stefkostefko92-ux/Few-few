// tools/agents/claims-audit.test.mjs — регресия за регистъра на правни/таксономични твърдения.
//
// Пази механизма, който правните цитати НЯМАХА: TTL свежест (повторна проверка срещу първоизточника),
// цялост на картата на зависимостта (agents[] сочат реални агенти) и авто-дрейф САМО при недвусмислен anchor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ttlBreaches, missingAgents, anchorDrift, realAgentIds, loadClaims } from "./claims-audit.mjs";

test("ttlBreaches: изтекъл checkedAt → провал; свеж → чист", () => {
  const reg = { ttlDays: 60, claims: [
    { id: "old", checkedAt: "2026-01-01" },
    { id: "fresh", checkedAt: "2026-07-20" },
    { id: "own-ttl", checkedAt: "2026-07-20", ttlDays: 5 },
  ] };
  const b = ttlBreaches(reg, "2026-07-30");
  const ids = b.map((x) => x.id);
  assert.ok(ids.includes("old"), "старо → breach");
  assert.ok(!ids.includes("fresh"), "свежо → без breach");
  assert.ok(ids.includes("own-ttl"), "per-claim ttlDays надделява (10д > 5д)");
});

test("missingAgents: твърдение сочи несъществуващ агент → флаг", () => {
  const ids = new Set(["razbivacha", "prodavacha"]);
  const reg = { claims: [
    { id: "a", agents: ["razbivacha", "ghost-agent"] },
    { id: "b", agents: ["prodavacha"] },
  ] };
  const m = missingAgents(reg, ids);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0], { id: "a", agent: "ghost-agent" });
});

test("anchorDrift: недвусмислен anchor липсва във всички цитирани → мъртво (all:true)", () => {
  const reg = { claims: [{ id: "x", anchor: "ZZ_NONEXISTENT_TOKEN_QQ", agents: ["razbivacha"] }] };
  const d = anchorDrift(reg);
  assert.equal(d.length, 1);
  assert.equal(d[0].all, true);
  assert.deepEqual(d[0].absent, ["razbivacha"]);
});

test("anchorDrift: наличен anchor → без дрейф", () => {
  // razbivacha реално носи LLM0 (OWASP LLM таксономия) в дефиниция/памет.
  const reg = { claims: [{ id: "owasp", anchor: "LLM0", agents: ["razbivacha"] }] };
  assert.equal(anchorDrift(reg).length, 0);
});

test("anchorDrift: твърдение БЕЗ anchor не се grep-ва (правните членове са двусмислени)", () => {
  const reg = { claims: [{ id: "legal", agents: ["prodavacha"] }] };
  assert.equal(anchorDrift(reg).length, 0);
});

test("реалният claims.json е валиден, свеж и с цяла карта", () => {
  const reg = loadClaims();
  assert.ok(reg.claims.length >= 3);
  assert.equal(missingAgents(reg, realAgentIds()).length, 0, "всички цитирани агенти съществуват");
  // всяко твърдение има source + checkedAt (source-or-nothing)
  for (const c of reg.claims) {
    assert.ok(c.source && c.source.length > 5, `${c.id} без източник`);
    assert.match(c.checkedAt, /^\d{4}-\d{2}-\d{2}$/, `${c.id} без валиден checkedAt`);
  }
});
