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

test("облачен loop (31.10): конекторите са изрични и обосновани, без тайни в env, изход само report/draft-pr", () => {
  const ok = { id: "c", description: "d", trigger: "schedule:every-5-days", command: "c", owner: "ai-djiyata", autonomy: "L2", escalation: "собственикът решава какво се слива", runtime: "cloud", connectors: [], network: "trusted", secretsInEnv: false, output: "draft-pr" };
  assert.equal(auditLoops({ loops: [ok] }, agentIds).errors.length, 0);
  const bad = auditLoops({ loops: [{ ...ok, connectors: undefined, network: "full", secretsInEnv: true, output: "push-main" }] }, agentIds).errors;
  for (const re of [/connectors/, /network/, /secretsInEnv/, /output/]) assert.ok(bad.some((e) => re.test(e)), `очаквах грешка ${re}`);
  const noWhy = auditLoops({ loops: [{ ...ok, connectors: ["Gmail"] }] }, agentIds).errors;
  assert.ok(noWhy.some((e) => /Gmail.*connectorsWhy/.test(e)), "конектор без обосновка пада");
  assert.equal(auditLoops({ loops: [{ ...ok, connectors: ["Gmail"], connectorsWhy: { Gmail: "чете само етикета X" } }] }, agentIds).errors.length, 0);
  assert.ok(auditLoops({ loops: [{ ...ok, runtime: "lambda" }] }, agentIds).errors.some((e) => /runtime/.test(e)));
});

test("реалната облачна задача anthropic-watch е в манифеста и е без конектори", () => {
  const w = manifest.loops.find((l) => l.id === "anthropic-watch");
  assert.ok(w, "anthropic-watch липсва в loops.json");
  assert.equal(w.runtime, "cloud");
  assert.deepEqual(w.connectors, []);
});
