// memory-retrieval.test.mjs — кои поуки стигат до агента. Всеки тест е за дефект, измерен на 2026-09-23:
// задачата не стигаше до куката · изборът беше само сред първите 40 реда (27% достъпни) · „най-нови"
// по позиция, а не по дата · чакащите от agents/memory изместваха собствените.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { terms, rank, select, taskFromTranscript, crossAgentPicks, isExpired } from "./memory-retrieval.mjs";
import { MutationNotApplied, withMutation } from "./mutation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "memory-retrieval.mjs");
const PRELOAD = join(HERE, "..", "..", ".claude", "hooks", "memory-preload.mjs");
const L = (date, text, src = "https://example.org/doc") => `- **${date}:** ${text} _(тест; verified; ${src})_`;
const filler = (n, date = "2026-07-01") => Array.from({ length: n }, (_, i) => L(date, `общ съвет номер ${i} за подредба на папки и именуване на файлове`));
let v = 0;
async function mutant(transform) {
  const src = readFileSync(LIB, "utf8"), m = transform(src);
  if (m === src) throw new MutationNotApplied(LIB);
  const tmp = LIB.replace(/\.mjs$/, `.mutant-${process.pid}-${++v}.mjs`);
  writeFileSync(tmp, m);
  try { return await import(pathToFileURL(tmp).href); } finally { rmSync(tmp, { force: true }); }
}

test("основи на словоформите: „фискалния бон“ намира „фискален бон“; акроними и числа остават цели", () => {
  const t = terms("Провери фискалния бон и SQL заявката при курс 1.95583");
  for (const w of ["фискал", "бон", "sql", "1.95583"]) assert.ok(t.has(w), w);
  assert.ok(terms("фискален бон").has("фискал"));
  assert.ok(!t.has("при"), "служебна дума");
});

test("ДОСТЪПНОСТ: релевантна поука на позиция 300 се избира (преди: само първите 40 участваха)", () => {
  const deep = L("2026-07-02", "Н-18 изисква УНП на всеки фискален бон, сторно само с позоваване на оригиналния бон");
  const all = [...filler(299), deep, ...filler(50)];
  const got = select(all, "прегледай сторно логиката на фискалния бон в CSPos", { budget: 3200 });
  assert.ok(got.includes(deep), "дълбоката релевантна поука трябва да влезе");
  assert.equal(got[0], deep, "и да е първа");
});

test("ДАТА, не позиция: без задача най-новите по дата са първи, каквато и да е подредбата във файла", () => {
  const all = [L("2026-07-01", "стара"), L("2026-09-20", "най-нова"), L("2026-08-01", "средна")];
  assert.deepEqual(select(all, "", { budget: 9999 }).map((l) => l.match(/\*\*(.+?):/)[1]), ["2026-09-20", "2026-08-01", "2026-07-01"]);
});

test("РЕГРЕСИЯ: 131 чакащи поуки не изместват собствената релевантна поука", () => {
  const pending = Array.from({ length: 131 }, (_, i) => L("2026-08-01", `чакаща поука ${i} за Docker мрежи и портове`));
  const own = L("2026-09-21", "Prisma транзакция обвива стоковото движение и продажбата — иначе складът се разминава");
  const got = select([...pending, own], "провери Prisma транзакцията около продажбата и склада", { budget: 3200 });
  assert.ok(got.includes(own), "собствената релевантна поука е вътре");
  assert.equal(got[0], own);
});

test("фон с таван: при задача несъвпадащите поуки заемат само fillerBudget, не целия бюджет", () => {
  const hit = L("2026-09-01", "Stripe webhook се проверява с подпис преди да се дадат права");
  const got = select([hit, ...filler(200)], "провери Stripe webhook подписа", { budget: 3200, fillerBudget: 300 });
  const fillerTok = got.filter((l) => l !== hit).reduce((s, l) => s + Math.round(l.length / 2.2), 0);
  assert.ok(got[0] === hit && fillerTok <= 420, `фонът е ограничен (~${fillerTok} т)`);
});

test("свежест: при равна релевантност изтеклата поука за наш код отстъпва на свежата", () => {
  const old = L("2026-01-02", "в CSPos/src/lib/fiscal.ts курсът е константа", "CSPos/src/lib/fiscal.ts:12");
  const fresh = L("2026-09-10", "в CSPos/src/lib/fiscal.ts курсът е константа от ЗВЕРБ", "CSPos/src/lib/fiscal.ts:14");
  assert.ok(isExpired(old, "2026-09-23") && !isExpired(fresh, "2026-09-23"));
  const r = rank([old, fresh], "курсът в fiscal.ts", { today: "2026-09-23" });
  assert.equal(r[0].line, fresh);
});

function transcript(dir, uses) {
  const p = join(dir, "main.jsonl");
  const lines = [];
  for (const u of uses) {
    lines.push(JSON.stringify({ message: { role: "assistant", content: [{ type: "tool_use", id: u.id, name: "Agent", input: { subagent_type: u.type, description: u.d || "", prompt: u.p } }] } }));
    if (u.done) lines.push(JSON.stringify({ message: { role: "user", content: [{ type: "tool_result", tool_use_id: u.id, content: "ok" }] } }));
  }
  writeFileSync(p, lines.join("\n") + "\n");
  return p;
}

test("задачата се чете от транскрипта: само ОТВОРЕНОТО извикване на същия тип агент", () => {
  const d = mkdtempSync(join(tmpdir(), "ret-"));
  try {
    const p = transcript(d, [
      { id: "t1", type: "kasadjiyata", p: "стара задача за Z-отчет", done: true },
      { id: "t2", type: "seo", p: "задача за sitemap" },
      { id: "t3", type: "kasadjiyata", p: "провери сторно на фискалния бон" },
    ]);
    assert.match(taskFromTranscript(p, "kasadjiyata"), /сторно/);
    assert.doesNotMatch(taskFromTranscript(p, "kasadjiyata"), /Z-отчет/, "завършеното не е задача");
    assert.match(taskFromTranscript(p, "seo"), /sitemap/);
    assert.equal(taskFromTranscript(p, "dizayner"), "");
    assert.equal(taskFromTranscript(join(d, "няма.jsonl"), "seo"), "", "липсващ транскрипт → празно, без хвърляне");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("колеги: поука от друг агент влиза само ако е сред най-релевантните във флота; своите — не", () => {
  const d = mkdtempSync(join(tmpdir(), "ret-"));
  try {
    const mem = (lines) => `# Памет\n\n## Проверени поуки (verified)\n${lines.join("\n")}\n\n## Карантина\n`;
    writeFileSync(join(d, "kodadjiyata.md"), mem([L("2026-09-01", "React ключове в списъци трябва да са стабилни"), ...filler(40)]));
    writeFileSync(join(d, "pravniyat-razbirach.md"), mem([L("2026-09-02", "банерът за бисквитки трябва да има равностоен бутон „Откажи“ по ePrivacy"), ...filler(40)]));
    const picks = crossAgentPicks(d, "kodadjiyata", "добави банер за бисквитки с бутон откажи", {});
    assert.equal(picks.length, 1);
    assert.equal(picks[0].agent, "pravniyat-razbirach");
    assert.deepEqual(crossAgentPicks(d, "pravniyat-razbirach", "добави банер за бисквитки с бутон откажи", {}), [], "своите не са „колеги“");
    assert.deepEqual(crossAgentPicks(d, "kodadjiyata", "", {}), [], "без задача — нищо");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("кука от край до край: задачата от транскрипта избира дълбоката релевантна поука", () => {
  const d = mkdtempSync(join(tmpdir(), "ret-"));
  try {
    mkdirSync(join(d, ".claude/agents/_memory"), { recursive: true });
    const deep = L("2026-07-02", "сторно се прави само с позоваване на УНП на оригиналния фискален бон");
    writeFileSync(join(d, ".claude/agents/_memory/kasadjiyata.md"), `# Памет\n\n## Проверени поуки (verified)\n${[...filler(120), deep].join("\n")}\n\n## Карантина\n`);
    const tp = transcript(d, [{ id: "a1", type: "kasadjiyata", p: "прегледай сторно логиката на фискалния бон" }]);
    const r = spawnSync(process.execPath, [PRELOAD], { input: JSON.stringify({ agent_type: "kasadjiyata", transcript_path: tp }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: d } });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(JSON.parse(r.stdout).hookSpecificOutput.additionalContext.includes("позоваване на УНП"), "поуката от позиция 121 е инжектирана");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("МУТАЦИЯ: върнато рязане на първите 40 → дълбоката поука изпада (тестът хапе)", async () => {
  const m = await mutant((s) => s.replace("const uniq = [...new Set(lessons)];", "const uniq = [...new Set(lessons)].slice(0, 40);"));
  const deep = L("2026-07-02", "Н-18 изисква УНП на всеки фискален бон");
  assert.ok(!m.select([...filler(299), deep], "фискален бон УНП", { budget: 3200 }).includes(deep));
});

test("МУТАЦИЯ: подреждане по позиция вместо по дата → старото излиза първо (тестът хапе)", async () => {
  const m = await mutant((s) => s.replace("y.date.localeCompare(x.date) || x.i - y.i", "x.i - y.i"));
  const all = [L("2026-07-01", "стара"), L("2026-09-20", "най-нова")];
  assert.match(m.select(all, "", { budget: 9999 })[0], /стара/);
});

test("МУТАЦИЯ: кука без задачата от транскрипта → дълбоката поука не влиза (тестът хапе)", () => {
  const d = mkdtempSync(join(tmpdir(), "ret-"));
  try {
    mkdirSync(join(d, ".claude/agents/_memory"), { recursive: true });
    const deep = L("2026-07-02", "сторно се прави само с позоваване на УНП на оригиналния фискален бон");
    writeFileSync(join(d, ".claude/agents/_memory/kasadjiyata.md"), `# Памет\n\n## Проверени поуки (verified)\n${[...filler(120, "2026-09-01"), deep].join("\n")}\n\n## Карантина\n`);
    const tp = transcript(d, [{ id: "a1", type: "kasadjiyata", p: "прегледай сторно логиката на фискалния бон" }]);
    const out = withMutation(PRELOAD, (s) => s.replace("taskTextOf(payload) || taskFromTranscript(payload.transcript_path, agent)", "taskTextOf(payload)"), () =>
      spawnSync(process.execPath, [PRELOAD], { input: JSON.stringify({ agent_type: "kasadjiyata", transcript_path: tp }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: d } }).stdout);
    assert.ok(!JSON.parse(out).hookSpecificOutput.additionalContext.includes("позоваване на УНП"), "без задача дълбоката поука остава извън");
  } finally { rmSync(d, { recursive: true, force: true }); }
});
