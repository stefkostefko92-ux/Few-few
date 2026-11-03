// trajectory-audit.test.mjs — node:test за грейдване на ПЪТЯ (гл.19 траектории).
import { test } from "node:test";
import assert from "node:assert/strict";
import { flowsFrom, matchSpec, auditTrajectories, canonicalFlows, coverage, CRITICAL_FLOWS } from "./trajectory-audit.mjs";
import { isSubsequence, scoreTrajectory, validateTrajectory } from "./evals/eval-lib.mjs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const rows = (...r) => r;
const start = (id, flow, lead) => ({ t: "start", id, flow, lead });
const hand = (id, from, to) => ({ t: "handoff", id, from, to });

test("flowsFrom: веригата тръгва от ПЪРВИЯ работил, не от lead", () => {
  const [f] = flowsFrom(rows(start("f1", "Деплой", "vps-adjiyata"), hand("f1", "pravniyat-razbirach", "kodadjiyata"), hand("f1", "kodadjiyata", "vps-adjiyata")));
  assert.deepEqual(f.steps, ["pravniyat-razbirach", "kodadjiyata", "vps-adjiyata"]);
});

test("flowsFrom: поток без предавания = една стъпка (lead)", () => {
  const [f] = flowsFrom(rows(start("f2", "Соло", "seo")));
  assert.deepEqual(f.steps, ["seo"]);
});

test("flowsFrom: последователно повторение не се брои за нова спирка", () => {
  const [f] = flowsFrom(rows(start("f3", "X", "seo"), hand("f3", "seo", "seo"), hand("f3", "seo", "kodadjiyata")));
  assert.deepEqual(f.steps, ["seo", "kodadjiyata"]);
});

test("isSubsequence: вмъкната стъпка е ок, разменен ред — не", () => {
  assert.ok(isSubsequence(["a", "c"], ["a", "b", "c"]));
  assert.ok(!isSubsequence(["a", "c"], ["c", "a"]));
});

test("scoreTrajectory: правилният път минава всички проверки", () => {
  const r = scoreTrajectory(["a", "b", "c"], { path: ["a", "c"], mustVisit: ["b"], forbid: ["z"], maxSteps: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.total, 4);
});

test("scoreTrajectory: прескочена КРИТИЧНА спирка пада (верен изход, грешен път)", () => {
  const r = scoreTrajectory(["prodavacha", "vps-adjiyata"], { mustVisit: ["pravniyat-razbirach"] });
  const c = r.checks.find((x) => x.kind === "mustVisit");
  assert.equal(c.ok, false);
  assert.deepEqual(c.misses, ["pravniyat-razbirach"]);
});

test("scoreTrajectory: разменен ред дава диагноза за РЕДА, не за липса", () => {
  const r = scoreTrajectory(["c", "a"], { path: ["a", "c"] });
  const c = r.checks.find((x) => x.kind === "path");
  assert.equal(c.ok, false);
  assert.match(c.misses[0], /грешен ред/);
});

test("scoreTrajectory: забранена спирка се хваща и се казва КОЯ", () => {
  const r = scoreTrajectory(["konveyera", "razbivacha"], { forbid: ["razbivacha"] });
  const c = r.checks.find((x) => x.kind === "forbid");
  assert.equal(c.ok, false);
  assert.deepEqual(c.hits, ["razbivacha"]);
});

test("scoreTrajectory: обиколка над maxSteps пада (ефективност)", () => {
  const r = scoreTrajectory(["a", "b", "c", "d"], { maxSteps: 3 });
  assert.equal(r.checks.find((x) => x.kind === "maxSteps").ok, false);
});

test("validateTrajectory: недостижим spec (maxSteps < path) гърми в гейта", () => {
  const errs = validateTrajectory({ path: ["a", "b", "c"], maxSteps: 2 });
  assert.ok(errs.some((e) => /недостижим/.test(e)));
});

test("validateTrajectory: агент едновременно очакван и забранен = противоречие", () => {
  const errs = validateTrajectory({ path: ["a"], forbid: ["a"] });
  assert.ok(errs.some((e) => /очакван и забранен/.test(e)));
});

test("validateTrajectory: непознат агент се хваща срещу регистъра", () => {
  const errs = validateTrajectory({ path: ["измислен"] }, new Set(["kodadjiyata"]));
  assert.ok(errs.some((e) => /непознат агент/.test(e)));
});

test("matchSpec: съпоставя по trajectory.flow, иначе по id на spec-а", () => {
  const specs = [{ id: "s1", trajectory: { flow: "Деплой" } }, { id: "CI/CD", trajectory: { path: ["a"] } }];
  assert.equal(matchSpec({ flow: "Деплой" }, specs).id, "s1");
  assert.equal(matchSpec({ flow: "CI/CD" }, specs).id, "CI/CD");
  assert.equal(matchSpec({ flow: "непознат" }, specs), null);
});

test("auditTrajectories: поток без ground-truth spec не се съди (не е провал)", () => {
  const r = auditTrajectories(rows(start("f9", "Няма spec", "seo")), []);
  assert.equal(r.graded.length, 0);
  assert.equal(r.failed.length, 0);
});

test("auditTrajectories: реален разминат път влиза във failed", () => {
  const specs = [{ id: "t", agent: "prodavacha", trajectory: { flow: "Плащания", mustVisit: ["pravniyat-razbirach"] } }];
  const r = auditTrajectories(rows(start("f8", "Плащания", "prodavacha"), hand("f8", "prodavacha", "vps-adjiyata")), specs);
  assert.equal(r.graded.length, 1);
  assert.equal(r.failed.length, 1);
  assert.deepEqual(r.failed[0].steps, ["prodavacha", "vps-adjiyata"]);
});

// --- Покритие поток↔spec ---------------------------------------------------------
// Дефектът, който това пази: `_orchestration.md` дефинира 24 канонични потока, а traj- spec-ове
// имаше за 2 (не 3 — `traj-payments` обявяваше име на поток, което НЕ СЪЩЕСТВУВА в оркестрацията,
// значи не можеше да се задейства никога: мъртъв spec, който изглежда като покритие).

test("canonicalFlows: чете потоците и водещите от секция „Чести потоци“", () => {
  const md = [
    "# Оркестрация",
    "## Чести потоци",
    "",
    "- **Плащане/checkout/billing.** Lead: **Продавача**.",
    "  Pipeline: prodavacha → kodadjiyata.",
    "",
    "- **Тестове.** Lead: **Изпитателят**.",
    "",
    "## Друга секция",
    "- **Това не е поток.** Lead: **никой**.",
  ].join("\n");
  const flows = canonicalFlows(md);
  assert.equal(flows.length, 2, "секцията след „Чести потоци“ не бива да се чете");
  assert.equal(flows[0].name, "Плащане/checkout/billing");
  assert.equal(flows[0].lead, "Продавача");
  assert.equal(flows[1].name, "Тестове");
});

test("canonicalFlows: липсваща секция → празен списък, не срив", () => {
  assert.deepEqual(canonicalFlows("# Само заглавие"), []);
  assert.deepEqual(canonicalFlows(""), []);
});

test("coverage: поток със spec се брои, поток без spec влиза в missing", () => {
  const flows = [{ name: "Плащане/checkout/billing", lead: "Продавача" }, { name: "Тестове", lead: "Изпитателят" }];
  const specs = [{ id: "traj-payments", trajectory: { flow: "Плащане/checkout/billing" } }];
  const c = coverage(flows, specs, []);
  assert.equal(c.total, 2);
  assert.equal(c.withSpec, 1);
  assert.deepEqual(c.missing, ["Тестове"]);
});

test("coverage: spec с име на поток, което не съществува, НЕ се брои за покритие", () => {
  // Точният дефект: traj-payments обявяваше „Плащания (Stripe checkout)“, а каноничното име е
  // „Плащане/checkout/billing“. Мъртъв spec — броеше се като работа, а не можеше да се задейства.
  const flows = [{ name: "Плащане/checkout/billing", lead: "Продавача" }];
  const c = coverage(flows, [{ id: "x", trajectory: { flow: "Съвсем друго име" } }], []);
  assert.equal(c.withSpec, 0);
  assert.deepEqual(c.missing, ["Плащане/checkout/billing"]);
});

test("coverage: „минат“ идва от дневника, не от наличието на spec", () => {
  const flows = [{ name: "Тестове", lead: "Изпитателят" }];
  assert.equal(coverage(flows, [], []).exercised, 0, "празен дневник = неизмерено");
  assert.equal(coverage(flows, [], [{ flow: "Тестове" }]).exercised, 1);
});

test("criticalMissing: паричен/правен поток без ground truth е ТВЪРД пропуск", () => {
  const flows = CRITICAL_FLOWS.map((name) => ({ name, lead: null }));
  const none = coverage(flows, [], []);
  assert.deepEqual(none.criticalMissing.sort(), [...CRITICAL_FLOWS].sort(),
    "без нито един spec всички критични потоци трябва да са в пропуските");

  const all = coverage(flows, CRITICAL_FLOWS.map((f, i) => ({ id: `s${i}`, trajectory: { flow: f } })), []);
  assert.deepEqual(all.criticalMissing, [], "покрити критични потоци → нула пропуски");
});

test("критичните потоци са подмножество на каноничните (иначе гейтът иска невъзможното)", () => {
  const md = readFileSync(join(ROOT_DIR, ".claude", "agents", "_orchestration.md"), "utf8");
  const names = new Set(canonicalFlows(md).map((f) => f.name));
  for (const c of CRITICAL_FLOWS)
    assert.ok(names.has(c), `критичният поток „${c}“ не съществува в _orchestration.md — гейт срещу призрак`);
});
