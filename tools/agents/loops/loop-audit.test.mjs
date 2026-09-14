// loop-audit.test.mjs — readiness-гейтът за loop-ове (CI auto-discover).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditLoops } from "./loop-audit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const agentIds = new Set(JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8")).agents.map((a) => a.id));
const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "loops.json"), "utf8"));

test("реалният манифест е readiness-годен (нула грешки)", () => {
  const r = auditLoops(manifest, agentIds);
  assert.equal(r.errors.length, 0, "грешки: " + JSON.stringify(r.errors));
  assert.ok(r.count >= 1);
});

test("автономия-стълба: L3 без budgetCap/denylist → грешка", () => {
  const r = auditLoops({ loops: [{ id: "x", description: "d", trigger: "manual", command: "c", owner: "ai-djiyata", autonomy: "L3", escalation: "човек решава винаги" }] }, agentIds);
  assert.ok(r.errors.some((e) => /budgetCap/.test(e)), "L3 иска budgetCap");
  assert.ok(r.errors.some((e) => /denylist/.test(e)), "L3 иска denylist");
});

test("L2 без ескалация → грешка; непознат owner → грешка; дубъл id → грешка", () => {
  const r = auditLoops({ loops: [
    { id: "a", description: "d", trigger: "manual", command: "c", owner: "ai-djiyata", autonomy: "L2", escalation: "" },
    { id: "a", description: "d", trigger: "bad-trigger", command: "c", owner: "нереален", autonomy: "L9", escalation: "x" },
  ] }, agentIds);
  assert.ok(r.errors.some((e) => /ескалация/.test(e)));
  assert.ok(r.errors.some((e) => /дублиран id/.test(e)));
  assert.ok(r.errors.some((e) => /не е реален агент/.test(e)));
  assert.ok(r.errors.some((e) => /невалидна автономия/.test(e)));
  assert.ok(r.errors.some((e) => /невалиден trigger/.test(e)));
});
