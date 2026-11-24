// agent-budget.test.mjs — месечен таван на разхода по агент (искане на собственика, 23.11.2026:
// „предупреждение при праг, спиране над тавана, докато аз не одобря“).
//
// Числата идват от реалната употреба (`tools/agents/evals/usage.jsonl`, само продукционни записи —
// живите проверки не се броят), конфигурацията е в `.claude/hooks/budgets.json`, пазена от guard-self:
// агент не може сам да си вдигне тавана. Чисти функции → тестове без мрежа и без git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { monthSpend, budgetDecision, loadBudgets, GENERIC } from "../../.claude/hooks/budget.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ours = new Set(["kodadjiyata", "seo"]);
const prices = { models: [{ id: "opus-5-5", in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 }] };
// 1M изходни токена на opus = $20
const rec = (agent, ts, out = 1_000_000, extra = {}) => ({ v: 2, ts, agent, model: "opus-5-5", input: 0, cacheRead: 0, cacheWrite: 0, output: out, ...extra });
const cfg = { warnAt: 0.8, default: 100, agents: { kodadjiyata: 200 }, generic: 50, fleet: 300, approved: {} };

test("monthSpend: само месецът, общите в един кош, флотът е сборът (и живите проверки)", () => {
  const s = monthSpend([
    rec("kodadjiyata", "2026-11-02T10:00"), rec("kodadjiyata", "2026-11-20T10:00"),
    rec("kodadjiyata", "2026-10-30T10:00"), // друг месец
    rec("seo", "2026-11-05T10:00", 1_000_000, { eval: "live-gate" }), // жива проверка — и тя харчи (Разбивача, N1)
    rec("general-purpose", "2026-11-06T10:00"), rec("workflow-subagent", "2026-11-07T10:00"),
  ], "2026-11", ours, prices);
  assert.equal(Math.round(s.byAgent.kodadjiyata), 40);
  assert.equal(Math.round(s.byAgent.seo), 20, "живата проверка се брои: режимът за оценки не бива да сваля тавана");
  assert.equal(Math.round(s.byAgent[GENERIC]), 40, "general-purpose + workflow → общ кош");
  assert.equal(Math.round(s.fleet), 100);
});

test("budgetDecision: под прага минава тихо, над прага предупреждава, над тавана спира", () => {
  const spend = (k, f = 0) => ({ byAgent: { kodadjiyata: k }, fleet: f || k });
  assert.deepEqual(pick(budgetDecision({ bucket: "kodadjiyata", month: "2026-11", spend: spend(100), cfg })), { block: false, warn: false });
  const w = budgetDecision({ bucket: "kodadjiyata", month: "2026-11", spend: spend(165), cfg });
  assert.equal(w.block, false);
  assert.equal(w.warn, true);
  assert.match(w.why, /83%/);
  const b = budgetDecision({ bucket: "kodadjiyata", month: "2026-11", spend: spend(200), cfg });
  assert.equal(b.block, true);
  assert.match(b.why, /budgets\.json/, "казва къде собственикът вдига тавана");
});

test("budgetDecision: агент без ред взима default; общият кош взима generic", () => {
  assert.equal(budgetDecision({ bucket: "seo", month: "2026-11", spend: { byAgent: { seo: 100 }, fleet: 100 }, cfg }).block, true);
  assert.equal(budgetDecision({ bucket: GENERIC, month: "2026-11", spend: { byAgent: { [GENERIC]: 49 }, fleet: 49 }, cfg }).block, false);
  assert.equal(budgetDecision({ bucket: GENERIC, month: "2026-11", spend: { byAgent: { [GENERIC]: 50 }, fleet: 50 }, cfg }).block, true);
});

test("budgetDecision: одобрението на собственика вдига тавана само за своя месец", () => {
  const c = { ...cfg, approved: { "2026-11": { kodadjiyata: 100 } } };
  const sp = { byAgent: { kodadjiyata: 250 }, fleet: 250 };
  assert.equal(budgetDecision({ bucket: "kodadjiyata", month: "2026-11", spend: sp, cfg: c }).block, false, "200 + 100 одобрени");
  assert.equal(budgetDecision({ bucket: "kodadjiyata", month: "2026-12", spend: sp, cfg: c }).block, true, "декември — одобрението не важи");
});

test("budgetDecision: таванът на флота спира всеки агент, дори под личния си", () => {
  const r = budgetDecision({ bucket: "seo", month: "2026-11", spend: { byAgent: { seo: 1 }, fleet: 300 }, cfg });
  assert.equal(r.block, true);
  assert.match(r.why, /флот/);
  const c = { ...cfg, approved: { "2026-11": { fleet: 100 } } };
  assert.equal(budgetDecision({ bucket: "seo", month: "2026-11", spend: { byAgent: { seo: 1 }, fleet: 300 }, cfg: c }).block, false);
});

// Разбивача, 23.11.2026 (N3): fail-open при всяка грешка изключваше тавана — лош JSON, папка вместо файл,
// низ вместо число. Собственикът иска „спира, докато не одобря“: таван, който не може да се провери, спира.
test("budgetDecision: без конфигурация или с невалидна — спира (fail-closed)", () => {
  const sp = { byAgent: { seo: 1 }, fleet: 1 };
  assert.equal(budgetDecision({ bucket: "seo", month: "2026-11", spend: sp, cfg: null }).block, true);
  assert.equal(budgetDecision({ bucket: "seo", month: "2026-11", spend: sp, cfg: { default: "много", fleet: 1500 } }).block, true, "default низ");
  assert.equal(budgetDecision({ bucket: "seo", month: "2026-11", spend: sp, cfg: { default: 100, fleet: "1500" } }).block, true, "fleet низ");
  assert.match(budgetDecision({ bucket: "seo", month: "2026-11", spend: sp, cfg: null }).why, /не може да се провери/);
});

test("budgets.json в репото: валиден, с праг и таван за флота; куката гледа и Workflow", () => {
  const c = loadBudgets();
  assert.ok(c && c.warnAt > 0 && c.warnAt < 1, "warnAt");
  assert.ok(c.default > 0 && c.generic > 0 && c.fleet > 0);
  const s = JSON.parse(readFileSync(join(HERE, "../../.claude/settings.json"), "utf8"));
  const g = s.hooks.PreToolUse.find((x) => x.hooks.some((h) => /agent-cap\.mjs/.test(h.command)));
  assert.equal(g.matcher, "Agent|Task|Workflow");
});

function pick(r) { return { block: r.block, warn: r.warn }; }

test("budgetCheck: Workflow и общ агент → общ кош; наш агент → своя; жива проверка → без таван", async () => {
  const { budgetCheck } = await import("../../.claude/hooks/budget.mjs");
  const records = [rec("general-purpose", "2026-11-06T10:00", 3_000_000)]; // $60 > generic 50
  const o = { month: "2026-11", records, prices, cfg };
  assert.equal(budgetCheck({ tool_name: "Workflow", tool_input: {} }, ours, o).block, true);
  assert.equal(budgetCheck({ tool_name: "Agent", tool_input: { subagent_type: "Explore" } }, ours, o).bucket, GENERIC);
  const mine = budgetCheck({ tool_name: "Agent", tool_input: { subagent_type: "seo" } }, ours, o);
  assert.equal(mine.bucket, "seo");
  assert.equal(mine.block, false);
  assert.equal(budgetCheck({ tool_name: "Workflow", tool_input: {} }, ours, { ...o, inEval: true }).block, true, "режимът за оценки не сваля тавана");
  assert.equal(budgetCheck({ tool_name: "Agent", tool_input: { subagent_type: "seo" } }, ours, { ...o, prices: null }).block, true, "без цени разходът не може да се смята → спира");
});

test("budgets.json и budget.mjs са под guard-self: агент не може сам да си вдигне тавана", async () => {
  const { decide } = await import("../../.claude/hooks/guard-self.mjs");
  for (const f of [".claude/hooks/budgets.json", ".claude/hooks/budget.mjs"]) {
    const r = decide({ tool_name: "Edit", agent_id: "a1", agent_type: "kodadjiyata", tool_input: { file_path: join(HERE, "../..", f) } });
    assert.equal(r.action, "deny", f);
  }
});

test("budgetDecision: точно на прага предупреждава; флотът над прага предупреждава и при агент под своя; невалиден warnAt → 0.8", () => {
  const w = budgetDecision({ bucket: "kodadjiyata", month: "2026-11", spend: { byAgent: { kodadjiyata: 160 }, fleet: 160 }, cfg });
  assert.equal(w.warn, true, "точно 80%");
  const f = budgetDecision({ bucket: "seo", month: "2026-11", spend: { byAgent: { seo: 1 }, fleet: 240 }, cfg });
  assert.equal(f.warn, true);
  assert.match(f.why, /флот/);
  const bad = budgetDecision({ bucket: "seo", month: "2026-11", spend: { byAgent: { seo: 79 }, fleet: 79 }, cfg: { ...cfg, warnAt: 2 } });
  assert.equal(bad.warn, false, "warnAt 2 е невалиден → 0.8, а 79 < 80");
});

test("куката: счупен budgets.json → спира (fail-closed); Workflow не се брои в „10 общи на сесия“", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const hook = join(HERE, "../../.claude/hooks/agent-cap.mjs");
  const broken = join(mkdtempSync(join(tmpdir(), "budget-")), "b.json");
  writeFileSync(broken, "{ не е json");
  const run = (payload) => spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, AGENT_BUDGETS_FILE_TEST: broken } });
  const r = run({ session_id: "t-broken", tool_name: "Agent", tool_input: { subagent_type: "seo" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /не може да се провери/);
  const ok = join(dirname(broken), "ok.json");
  writeFileSync(ok, JSON.stringify({ warnAt: 0.8, default: 1e6, agents: {}, generic: 1e6, fleet: 1e7, approved: {} }));
  const runOk = (payload) => spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, AGENT_BUDGETS_FILE_TEST: ok } });
  const sid = "t-wf-" + process.pid;
  for (let i = 0; i < 12; i++) assert.equal(runOk({ session_id: sid, tool_name: "Workflow", tool_input: {} }).status, 0, `Workflow № ${i + 1}`);
});

// Разбивача (N6): нов `.claude/agents/general-purpose.md` (или какъвто и да е .md) правеше нов кош и бягаше от
// общия. Нашите агенти идват от matcher-а на SubagentStart в settings.json (пазен от guard-self), а
// вградените типове са винаги общи.
test("ourAgents: от пазения matcher в settings.json; вградените типове са винаги общи", async () => {
  const { ourAgents } = await import("../../.claude/hooks/agent-cap.mjs");
  const o = ourAgents();
  assert.ok(o.has("kodadjiyata") && o.size >= 30);
  for (const b of ["general-purpose", "Explore", "Plan", "fork", "claude", "statusline-setup"]) assert.ok(!o.has(b), b);
});

// Разбивача (N2): цените и дневникът на разхода не бяха пазени — `{}` в prices.json или ред с по-високо `v`
// в буфера сваляше разхода до 0. Сега са под guard-self.
test("guard-self пази данните на тавана: prices.json, usage.jsonl, буфера и флага за оценки", async () => {
  const { decide } = await import("../../.claude/hooks/guard-self.mjs");
  for (const f of ["tools/agents/prices.json", "tools/agents/evals/usage.jsonl", ".git/agents-usage.pending.jsonl", ".git/worktrees/x/agents-eval.json"]) {
    const r = decide({ tool_name: "Write", agent_id: "a1", agent_type: "konveyera", tool_input: { file_path: join(HERE, "../..", f), content: "{}" } });
    assert.equal(r.action, "deny", f);
  }
});

// Разбивача (N4): `claude -p` от Bash пуска нова сесия покрай куката (с --bare — и без куки изобщо).
test("guard-dangerous: вложена сесия на Claude Code от агент се спира", async () => {
  const { isCatastrophic } = await import("../../.claude/hooks/guard-dangerous.mjs");
  for (const c of ['claude -p "направи X"', "claude --print --bare x", "npx @anthropic-ai/claude-code -p x", "cd /tmp && claude -p x"])
    assert.ok(isCatastrophic(c), c);
  for (const c of ["node tools/agents/live-gate.mjs", 'git commit -m "claude -p в описанието"', "ls ~/.claude/agents"])
    assert.equal(isCatastrophic(c), null, c);
});

// AI-джията, преглед на PR #482 (24.11.2026): `claude ultrareview` е съгласие за таксуване още при пускането,
// а с --post публикува в PR без въпрос — от Bash на агент или на сесията това е платено изходящо действие без
// „да“ на собственика. Пуска го само човек: `/code-review ultra <номер>` в своя терминал.
test("guard-dangerous: платеният Ultrareview от Bash се спира — пуска го само собственикът", async () => {
  const { isCatastrophic } = await import("../../.claude/hooks/guard-dangerous.mjs");
  for (const c of ["claude ultrareview 482 --post", "claude ultrareview", "cd /x && claude ultrareview origin/main", "claude.exe ultrareview 12",
    "sudo claude ultrareview 1", "claude --model opus ultrareview 482"])
    assert.ok(isCatastrophic(c), c);
  for (const c of ['git commit -m "claude ultrareview по избор"', "grep -rn ultrareview tools/agents", "node tools/agents/core-map.mjs --diff", 'echo "claude ultrareview"'])
    assert.equal(isCatastrophic(c), null, c);
});
