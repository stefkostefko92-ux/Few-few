import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { wrapperPrompt, stripOrchestratorStop, expandJobs, parseResult, makeWorktree } from "./live-run.mjs";
import { evalMode } from "../../lib/eval-mode.mjs";

test("обвивката пуска агента по id и иска дословния отговор", () => {
  const p = wrapperPrompt("seo", "провери sitemap");
  assert.match(p, /subagent_type: seo/);
  assert.match(p, /дословно/);
  assert.match(p, /провери sitemap$/);
  assert.match(p, /ВЕДНЪЖ/);
  assert.match(p, /run_in_background: false/);
  assert.match(p, /никога бележка за дубликата/);
});

test("от Stop куките отпадат само тези на оркестратора", () => {
  const s = stripOrchestratorStop({ hooks: { Stop: [{ hooks: [{ command: "node .claude/hooks/session-dod.mjs" }, { command: "node x.mjs" }] }, { hooks: [{ command: "node .claude/hooks/artifact-sync.mjs" }] }], SubagentStop: [{ hooks: [{ command: "dod-check" }] }] } });
  assert.deepEqual(s.hooks.Stop, [{ hooks: [{ command: "node x.mjs" }] }]);
  assert.equal(s.hooks.SubagentStop.length, 1);
});

test("задачите се разгъват по опити, а изходът се чете от JSON на claude -p", () => {
  const jobs = expandJobs("kasadjiyata:kasadjiyata:3,seo", (id) => `задача ${id}`);
  assert.deepEqual(jobs.map((j) => j.name), ["kasadjiyata.1.txt", "kasadjiyata.2.txt", "kasadjiyata.3.txt", "seo.txt"]);
  assert.deepEqual(parseResult('{"result":"ок","total_cost_usd":0.25}'), { text: "ок", costUsd: 0.25, sessionId: "" });
  assert.equal(parseResult('{"result":"ок","session_id":"abc-1"}').sessionId, "abc-1", "собствената сесия на пускането");
  assert.equal(parseResult("суров").text, "суров");
});

// Хванато на 27.10.2026: AGENT_MEMORY_SYNC=0 спираше само фоновия sync, а memory-capture публикуваше поуки
// в agents/memory направо от копието (общи refs) — оценката учеше и опит 2 виждаше поуката на опит 1.
test("копието за оценка е в eval режим (не учи), копието за преглед на PR — не", () => {
  const measured = makeWorktree("HEAD");
  const learning = makeWorktree("HEAD", null, { measure: false });
  try {
    assert.equal(evalMode(measured.dir)?.label, "live-run");
    assert.equal(evalMode(learning.dir), null);
    const settings = JSON.parse(readFileSync(join(measured.dir, ".claude", "settings.json"), "utf8"));
    assert.ok(!JSON.stringify(settings.hooks?.Stop || []).includes("session-dod"));
  } finally { measured.cleanup(); learning.cleanup(); }
  assert.equal(existsSync(measured.dir), false);
});

// Живият гейт 27.10.2026: файловете на агента в scratchpad-а стигат до оценителя.
test("посочените файлове от scratchpad-а се прикачват към изхода", async () => {
  const { attachScratchpad } = await import("./live-run.mjs");
  const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const dir = "/tmp/claude-0/-tmp-live-run-TEST01/abc/scratchpad/cs_shop";
  mkdirSync(dir + "/server", { recursive: true });
  writeFileSync(dir + "/fxmanifest.lua", "fx_version 'cerulean'\n");
  writeFileSync(dir + "/server/main.lua", "-- сървър\n");
  try {
    const out = attachScratchpad("Файловете са в `" + dir + "/`:\n- fxmanifest.lua");
    assert.match(out, /fx_version 'cerulean'/);
    assert.match(out, /-- сървър/);
    assert.equal(attachScratchpad("без пътища"), "без пътища");
  } finally { rmSync("/tmp/claude-0/-tmp-live-run-TEST01", { recursive: true, force: true }); }
});

test("--set: рамо на сравнение сменя само полето във frontmatter на копието (31.10)", async () => {
  const { patchFrontmatter, parseSets } = await import("./live-run.mjs");
  const md = "---\nname: x\nmodel: opus\neffort: high\n---\n\n# тяло\neffort: high в тялото остава\n";
  const out = patchFrontmatter(md, "effort", "medium");
  assert.match(out, /^effort: medium$/m);
  assert.match(out, /effort: high в тялото остава/, "тялото не се пипа");
  assert.match(patchFrontmatter(md, "autoCompactWindow", "200000"), /^autoCompactWindow: 200000$/m, "липсващо поле се добавя");
  assert.deepEqual(parseSets("kodadjiyata.effort=medium,seo.model=sonnet"), [{ agent: "kodadjiyata", field: "effort", value: "medium" }, { agent: "seo", field: "model", value: "sonnet" }]);
  assert.throws(() => parseSets("kodadjiyata.effort=$(rm -rf)"));
  assert.throws(() => patchFrontmatter(md, "effort", "a b"));
});

test("частично копие (31.10): коренът, агентският слой, deploy и продуктите на PR-а; нищо друго", async () => {
  const { sparsePatterns, makeWorktree } = await import("./live-run.mjs");
  assert.deepEqual(sparsePatterns(["CSPos"]), ["/*", "!/*/", "/.claude/", "/tools/", "/deploy/", "/CSPos/"]);
  assert.deepEqual(sparsePatterns(["../etc", "CSPos;rm"]), ["/*", "!/*/", "/.claude/", "/tools/", "/deploy/"], "само чисти имена на папки");
  const { existsSync: ex } = await import("node:fs");
  const { dir, cleanup } = makeWorktree("HEAD", null, { measure: false, sparse: ["CSPos"] });
  try {
    assert.ok(ex(join(dir, "CSPos", "package.json")), "продуктът на PR-а е в копието");
    assert.ok(ex(join(dir, ".claude", "settings.json")) && ex(join(dir, "tools", "agents")), "агентският слой е в копието");
    assert.ok(ex(join(dir, "CLAUDE.md")), "файловете в корена са в копието");
    assert.ok(!ex(join(dir, "zabobovdol")), "чужд продукт не е в копието");
  } finally { cleanup(); }
});

test("--memory off: копието е в eval режим без личната памет (A/B на паметта, 31.10)", async () => {
  const { makeWorktree } = await import("./live-run.mjs");
  const { evalMode } = await import("../../lib/eval-mode.mjs");
  const { dir, cleanup } = makeWorktree("HEAD", null, { sparse: ["medqr"], memory: "off" });
  try { assert.equal(evalMode(dir)?.memory, "off"); } finally { cleanup(); }
});

test("--patch: рамо за аблация сменя точен текст само в копието; липсващ текст е грешка", async () => {
  const { applyPatch } = await import("./live-run.mjs");
  const { mkdtempSync, writeFileSync: w, readFileSync: r, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const d = mkdtempSync(join(tmpdir(), "patch-"));
  mkdirSync(join(d, "a"));
  w(join(d, "a", "P.md"), "ред 1\n- провери пак преди Предаване\nред 3\n");
  applyPatch(d, "a/P.md::- провери пак преди Предаване\n::");
  assert.equal(r(join(d, "a", "P.md"), "utf8"), "ред 1\nред 3\n");
  assert.throws(() => applyPatch(d, "a/P.md::няма такъв ред::"), /не е намерен/);
  assert.throws(() => applyPatch(d, "../x::a::b"), /невалидно/);
});

// Регресия 2026-11-02: оценката мереше агентите без запис и без команди (само четене), а в продукция те пишат
// и пускат тестове. Записът е разрешен само под /tmp (копието и scratchpad-ът), никога върху истинското репо.
test("EVAL_ALLOWED: запис само под /tmp, команди само изброени, без голи Write/Edit/Bash", async () => {
  const { EVAL_ALLOWED, ALLOWED } = await import("./live-run.mjs");
  for (const t of ALLOWED) assert.ok(EVAL_ALLOWED.includes(t), t);
  for (const bare of ["Write", "Edit", "Bash", "Bash(*)", "Write(**)", "Edit(**)"]) assert.ok(!EVAL_ALLOWED.includes(bare), bare);
  for (const r of EVAL_ALLOWED.filter((x) => /^(Write|Edit)\(/.test(x))) assert.match(r, /^(Write|Edit)\(\/\/tmp\//, r);
  assert.ok(!EVAL_ALLOWED.some((r) => /Few-few|\/home\//.test(r)), "истинското репо не е в разрешените пътища");
  assert.ok(!EVAL_ALLOWED.some((r) => /^Bash\(npx \*\)|^Bash\(curl|^Bash\(git (push|commit|reset)/.test(r)), "без мрежови/записващи git команди и произволен npx");
});

// Регресия 2026-11-02: щом агентите пишат, кодът им е във файл — оценителят трябва да го вижда (от транскрипта
// на собствената сесия на пускането, не от общото копие, което паралелен опит може да е презаписал).
test("attachWrites: Write/Edit на агента от собствената сесия се прикачват към оценявания текст", async () => {
  const { attachWrites } = await import("./live-run.mjs");
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const home = mkdtempSync(join(tmpdir(), "aw-")), wt = "/tmp/live-run-AbC123", sid = "sess-1";
  const dir = join(home, ".claude", "projects", "-tmp-live-run-AbC123", sid, "subagents");
  mkdirSync(dir, { recursive: true });
  const line = (b) => JSON.stringify({ message: { role: "assistant", content: [b] } });
  writeFileSync(join(dir, "agent-x.jsonl"), [
    line({ type: "tool_use", name: "Write", input: { file_path: `${wt}/e2e/login.spec.ts`, content: "await page.getByRole('button')" } }),
    line({ type: "tool_use", name: "Edit", input: { file_path: `${wt}/a.ts`, old_string: "x", new_string: "getByLabel('Имейл')" } }),
  ].join("\n"));
  const out = attachWrites("резюме", sid, wt, home);
  assert.match(out, /записано от агента \(Write\): .*login\.spec\.ts[\s\S]*getByRole/);
  assert.match(out, /getByLabel\('Имейл'\)/);
  assert.equal(attachWrites("резюме", "", wt, home), "резюме", "без сесия — само текстът");
  assert.equal(attachWrites("резюме", "../evil", wt, home), "резюме", "невалиден id на сесия не отваря път");
  rmSync(home, { recursive: true, force: true });
});

// Регресия 2026-11-02: сляпото съдийство видя едни и същи записани файлове в два опита — опитите деляха сесията на
// родителя (махнатото CLAUDE_CODE_SESSION_ID не стигаше). Всяко пускане носи изричен --session-id.
test("jobArgs: всяко пускане е с изричен --session-id (UUID), иначе грешка", async () => {
  const { jobArgs } = await import("./live-run.mjs");
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  const a = jobArgs({ agent: "seo", task: "т" }, { sessionId: id });
  assert.equal(a[a.indexOf("--session-id") + 1], id);
  assert.equal(a[0], "-p");
  assert.throws(() => jobArgs({ agent: "seo", task: "т" }, {}), /UUID/);
  assert.throws(() => jobArgs({ agent: "seo", task: "т" }, { sessionId: "../x" }), /UUID/);
});

// Регресия 2026-11-02: паралелните опити в ЕДНО копие виждаха файловете един на друг. wtFor дава свое копие на
// всяко пускане, което пише, и го чисти след него; null → общото копие (пробите само цитират).
test("runJobs: wtFor дава собствено копие на пускане и го чисти; null остава общото", async () => {
  const { runJobs } = await import("./live-run.mjs");
  const seen = [], cleaned = [];
  const jobs = [{ agent: "a", task: "т", name: "a.1.txt" }, { agent: "a", task: "т", name: "a.2.txt" }, { agent: "p", task: "т", name: "probe-p.txt" }];
  await runJobs(jobs, {
    wt: "/tmp", bin: "true", concurrency: 3,
    wtFor: (j) => { if (j.name.startsWith("probe-")) return null; const d = `/tmp/own-${j.name}`; seen.push(d); return { dir: "/tmp", cleanup: () => cleaned.push(d) }; },
  });
  assert.deepEqual(seen.sort(), ["/tmp/own-a.1.txt", "/tmp/own-a.2.txt"]);
  assert.deepEqual(cleaned.sort(), seen, "всяко собствено копие се чисти");
});

test("makeWorktree: провал на git носи причината в грешката (не голо „код 128“)", async () => {
  const { makeWorktree } = await import("./live-run.mjs");
  assert.throws(() => makeWorktree("няма-такъв-ref-0000"), (e) => /invalid reference|not a valid|unknown revision|fatal/i.test(String(e.message)));
});

test("EVAL_ALLOWED пуска локалната търсачка на ui-ux-pro-max (иначе оценката мери Дизайнера без каталога)", async () => {
  const { EVAL_ALLOWED } = await import("./live-run.mjs");
  assert.ok(EVAL_ALLOWED.some((r) => r.startsWith("Bash(python3 -I -B .claude/skills/ui-ux-pro-max/scripts/search.py")));
  assert.ok(!EVAL_ALLOWED.some((r) => /^Bash\(python3 \*\)$|^Bash\(python3\)$/.test(r)), "без общо разрешение за python3");
});
