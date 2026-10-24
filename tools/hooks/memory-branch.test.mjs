// memory-branch.test.mjs — ученето в собствен клон (`agents/memory`) срещу ИСТИНСКИ git: bare origin,
// отворен merge, разклонени клонове, напреднал main. Заменя git-sync.test.mjs: старият авто-комит
// (commit в клона на задачата) вече не съществува, а двата му дефекта се доказват тук като КЛАС.
//
// Инварианти (всеки с мутация):
//  1. публикуването НЕ пипа HEAD, индекса, работното дърво, отворен merge на човека;
//  2. разклонени копия на клона (две сесии) се обединяват БЕЗ загуба на поука;
//  3. напреднал main се сгъва в клона → PR-ът е бърз (main е предшественик), курацията на main се пази;
//  4. следващият агент вижда поуката веднага (memory-preload), без тя да е в клона на задачата.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withMutation, MutationNotApplied } from "../lib/mutation.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = join(REPO, "tools", "lib", "memory-branch.mjs");
const CAPTURE = join(REPO, ".claude", "hooks", "memory-capture.mjs");
const PRELOAD = join(REPO, ".claude", "hooks", "memory-preload.mjs");
const MEM = ".claude/agents/_memory/testagent.md";
const ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_NOSYSTEM: "1" };
let n = 0;
const lib = () => import(pathToFileURL(LIB).href + `?v=${++n}`);
// Мутант на библиотеката: копие ДО оригинала (относителните импорти работят), импортирано асинхронно.
// withMutation не става тук — възстановява файла синхронно, преди асинхронният import да го прочете.
async function mutantLib(transform) {
  const src = readFileSync(LIB, "utf8"), mutated = transform(src);
  if (mutated === src) throw new MutationNotApplied(LIB);
  const tmp = LIB.replace(/\.mjs$/, `.mutant-${process.pid}-${++n}.mjs`);
  writeFileSync(tmp, mutated);
  try { return await import(pathToFileURL(tmp).href); } finally { rmSync(tmp, { force: true }); }
}

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...ENV } });
  return { status: r.status, out: (r.stdout + r.stderr).trim() };
}
const L = (d, t) => `- **${d}:** ${t} _(тест; verified; https://example.org/${encodeURIComponent(t.slice(0, 8))})_`;
const L0 = L("2026-01-01", "стара поука, която main ще махне при курация");

/** bare origin + работен клон с main; нашата памет + табло. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "membranch-"));
  const origin = join(root, "origin.git"), work = join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  mkdirSync(join(work, ".claude", "agents", "_memory"), { recursive: true });
  mkdirSync(join(work, "agents-dashboard"), { recursive: true });
  git(work, "init", "-q", "-b", "main");
  git(work, "config", "commit.gpgsign", "false");
  writeFileSync(join(work, MEM), `# Памет\n\n## Проверени поуки (verified)\n${L0}\n\n## Карантина (непроверени — НЕ са факт)\n`);
  const dash = { meta: {}, agents: [{ id: "testagent", knowledge: { lessons: 1 }, evolution: [{ version: "1.0.0", date: "2026-01-01", event: "Раждане", detail: "-" }], activity: [] }] };
  writeFileSync(join(work, "agents-dashboard", "agents.json"), JSON.stringify(dash, null, 2) + "\n");
  writeFileSync(join(work, "agents-dashboard", "index.html"), `<script>\nconst FALLBACK = ${JSON.stringify(dash)};\n</script>\n`);
  writeFileSync(join(work, "foreign.txt"), "v1\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "init");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-q", "origin", "main");
  git(work, "fetch", "-q", "origin");
  return { root, origin, work };
}
const clone = (f, name) => { const d = join(f.root, name); git(f.root, "clone", "-q", f.origin, d); git(d, "config", "commit.gpgsign", "false"); return d; };
const memAt = (cwd, ref) => git(cwd, "show", `${ref}:${MEM}`).out;
const dashAt = (cwd, ref) => JSON.parse(git(cwd, "show", `${ref}:agents-dashboard/agents.json`).out);
const snapshot = (cwd) => ({
  head: git(cwd, "rev-parse", "HEAD").out,
  staged: git(cwd, "diff", "--cached", "--name-only").out,
  status: git(cwd, "status", "--porcelain").out,
  merge: git(cwd, "rev-parse", "-q", "--verify", "MERGE_HEAD").out,
});

test("1. публикуване по средата на отворен merge с чуждо стажирано: човекът не губи НИЩО", async () => {
  const f = fixture();
  try {
    const { publishLessons } = await lib();
    git(f.work, "checkout", "-q", "-b", "feature");
    writeFileSync(join(f.work, "foreign.txt"), "feature\n");
    git(f.work, "commit", "-q", "-am", "feature");
    git(f.work, "checkout", "-q", "main");
    writeFileSync(join(f.work, "other.txt"), "main\n");
    git(f.work, "add", "other.txt");
    git(f.work, "commit", "-q", "-m", "main move");
    git(f.work, "merge", "--no-commit", "--no-ff", "feature");
    writeFileSync(join(f.work, "staged-by-human.txt"), "мое\n");
    git(f.work, "add", "staged-by-human.txt");
    const before = snapshot(f.work);
    assert.ok(before.merge, "merge-ът е отворен");

    const r = publishLessons(f.work, { testagent: { verified: [L("2026-09-23", "нова поука по време на merge")] } }, { date: "2026-09-23" });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(snapshot(f.work), before, "HEAD/индекс/работно дърво/MERGE_HEAD — непокътнати");
    assert.match(memAt(f.work, "agents/memory"), /нова поука по време на merge/);
    const d = dashAt(f.work, "agents/memory").agents[0];
    assert.equal(d.knowledge.lessons, 2, "таблото брои реалните поуки");
    assert.equal(d.evolution.at(-1).version, "1.1.0", "проверено учене вдига версията");
    assert.equal(git(f.work, "show", "--name-only", "--format=", "agents/memory").out.split("\n").sort().join(","),
      [".claude/agents/_memory/testagent.md", "agents-dashboard/agents.json", "agents-dashboard/index.html"].join(","),
      "commit-ът носи само паметта и таблото");
    // Повторна публикация на същата поука → без нов commit.
    const again = publishLessons(f.work, { testagent: { verified: [L("2026-09-24", "нова поука по време на merge")] } });
    assert.equal(again.unchanged, true, "дубъл по тяло не се публикува");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("1м. МУТАЦИЯ: без временен индекс публикуването замърсява индекса на човека (тестът хапе)", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.work, "staged-by-human.txt"), "мое\n");
    git(f.work, "add", "staged-by-human.txt");
    const before = snapshot(f.work);
    const { publishLessons } = await mutantLib((s) => s.replace("const env = { GIT_INDEX_FILE: idx, ...IDENTITY };", "const env = { ...IDENTITY };"));
    publishLessons(f.work, { testagent: { verified: [L("2026-09-23", "поука на мутанта")] } });
    assert.notDeepEqual(snapshot(f.work), before, "мутантът пипа индекса на човека — точно класът на дефекта");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("2. две сесии публикуват паралелно → sync обединява без загуба и пуска", async () => {
  const f = fixture();
  try {
    const { publishLessons, syncMemoryBranch } = await lib();
    const other = clone(f, "other");
    publishLessons(other, { testagent: { verified: [L("2026-09-23", "поука от другата сесия")] } });
    assert.equal(syncMemoryBranch(other, { date: "2026-09-23" }).pushed, true, "първата сесия пуска");
    publishLessons(f.work, { testagent: { verified: [L("2026-09-23", "поука от тази сесия")] } });
    const r = syncMemoryBranch(f.work, { date: "2026-09-23" });
    assert.equal(r.ok, true, r.steps.join(" · "));
    assert.equal(r.pushed, true);
    const mem = memAt(f.work, "origin/agents/memory");
    assert.match(mem, /поука от другата сесия/);
    assert.match(mem, /поука от тази сесия/);
    assert.equal(dashAt(f.work, "origin/agents/memory").agents[0].knowledge.lessons, 3, "таблото брои и двете");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("2м. МУТАЦИЯ: обединяване без поуките на локалния клон губи учене (тестът хапе)", async () => {
  const f = fixture();
  try {
    const other = clone(f, "other");
    const { publishLessons, syncMemoryBranch } = await mutantLib((s) => s.replace("const lessons = addedSince(cwd, other, since);", "const lessons = {};"));
    publishLessons(other, { testagent: { verified: [L("2026-09-23", "поука от другата сесия")] } });
    syncMemoryBranch(other);
    publishLessons(f.work, { testagent: { verified: [L("2026-09-23", "поука от тази сесия")] } });
    syncMemoryBranch(f.work);
    const mem = memAt(f.work, "origin/agents/memory");
    assert.doesNotMatch(mem, /поука от тази сесия/, "мутантът губи локалната поука");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("3. напреднал main се сгъва: PR-ът е бърз, курацията на main се пази, нищо не се губи", async () => {
  const f = fixture();
  try {
    const { publishLessons, syncMemoryBranch } = await lib();
    publishLessons(f.work, { testagent: { verified: [L("2026-09-23", "поука в клона на паметта")] } });
    syncMemoryBranch(f.work, { date: "2026-09-23" });
    // main напредва: курация маха L0 + продуктова промяна.
    const human = clone(f, "human");
    const memFile = join(human, MEM);
    writeFileSync(memFile, readFileSync(memFile, "utf8").replace(L0 + "\n", ""));
    writeFileSync(join(human, "product.txt"), "продукт\n");
    git(human, "add", "-A");
    git(human, "commit", "-q", "-m", "курация + продукт");
    git(human, "push", "-q", "origin", "main");

    const r = syncMemoryBranch(f.work, { date: "2026-09-23" });
    assert.ok(r.steps.includes("сгънат main"), r.steps.join(" · "));
    assert.equal(git(f.work, "merge-base", "--is-ancestor", "origin/main", "origin/agents/memory").status, 0, "main е предшественик → PR-ът се слива бързо, без конфликти");
    const mem = memAt(f.work, "origin/agents/memory");
    assert.match(mem, /поука в клона на паметта/, "поуката оцелява");
    assert.doesNotMatch(mem, /стара поука, която main ще махне/, "курацията на main НЕ се връща");
    assert.equal(git(f.work, "show", "origin/agents/memory:product.txt").out, "продукт", "продуктовата промяна на main е там");
    const diff = git(f.work, "diff", "--name-only", "origin/main", "origin/agents/memory").out.split("\n").sort();
    assert.deepEqual(diff, [".claude/agents/_memory/testagent.md", "agents-dashboard/agents.json", "agents-dashboard/index.html"], "PR-ът носи само памет + табло");
    assert.equal(dashAt(f.work, "origin/agents/memory").agents[0].knowledge.lessons, 1, "таблото е пресметнато от паметта (L0 махната, 1 нова)");

    // PR-ът се слива (fast-forward) → следващият sync догонва main, без празен commit.
    git(human, "fetch", "-q", "origin");
    git(human, "merge", "-q", "--ff-only", "origin/agents/memory");
    git(human, "push", "-q", "origin", "main");
    const r2 = syncMemoryBranch(f.work, { date: "2026-09-23" });
    assert.ok(r2.ok, r2.steps.join(" · "));
    assert.equal(git(f.work, "rev-parse", "agents/memory").out, git(f.work, "rev-parse", "origin/main").out);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("4. кука → клон на паметта → следващият агент я вижда; клонът на задачата остава чист", async () => {
  const f = fixture();
  try {
    git(f.work, "checkout", "-q", "-b", "claude/task");
    const transcript = join(f.root, "t.jsonl");
    const block = "```learn\nagent: testagent\ndate: 2026-09-23\nlessons:\n  - text: поука от куката през клона на паметта\n    confidence: verified\n    source: https://web.dev/articles/lcp\n    scope: тест\n```";
    writeFileSync(transcript, JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: block }] } }) + "\n");
    const env = { ...process.env, ...ENV, CLAUDE_PROJECT_DIR: f.work, AGENT_MEMORY_SYNC: "0" };
    const c = spawnSync(process.execPath, [CAPTURE], { input: JSON.stringify({ transcript_path: transcript }), encoding: "utf8", env });
    assert.equal(c.status, 0, c.stderr);
    assert.equal(git(f.work, "status", "--porcelain").out, "", "клонът на задачата е чист — нито памет, нито табло");
    assert.equal(git(f.work, "log", "--oneline", "main..claude/task").out, "", "нула авто-комити в клона на задачата");
    assert.match(memAt(f.work, "agents/memory"), /поука от куката през клона на паметта/);

    const p = spawnSync(process.execPath, [PRELOAD], { input: JSON.stringify({ agent_type: "testagent" }), encoding: "utf8", env });
    assert.equal(p.status, 0, p.stderr);
    assert.match(p.stdout, /поука от куката през клона на паметта/, "следващият агент вижда поуката веднага");
    // Същият блок пак → няма нов commit (дедупът вижда чакащите в клона).
    const tip = git(f.work, "rev-parse", "agents/memory").out;
    spawnSync(process.execPath, [CAPTURE], { input: JSON.stringify({ transcript_path: transcript }), encoding: "utf8", env });
    assert.equal(git(f.work, "rev-parse", "agents/memory").out, tip, "повтореното учене не дублира");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("4м. МУТАЦИЯ: preload без чакащите поуки — следващият агент „забравя“ (тестът хапе)", async () => {
  const f = fixture();
  try {
    const { publishLessons } = await lib();
    publishLessons(f.work, { testagent: { verified: [L("2026-09-23", "чакаща поука в клона")] } });
    const env = { ...process.env, ...ENV, CLAUDE_PROJECT_DIR: f.work };
    const out = withMutation(PRELOAD, (s) => s.replace("select([...pending, ...own]", "select([...own]"),
      () => spawnSync(process.execPath, [PRELOAD], { input: JSON.stringify({ agent_type: "testagent" }), encoding: "utf8", env }).stdout);
    assert.doesNotMatch(out, /чакаща поука в клона/, "мутантът не вижда поуката — точно дефектът");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// Реален инцидент (2026-09-25): сгъване на main в паметта свали версиите на 4 агента (напр. dizayner
// 20.1 → 19.8, kodadjiyata 39.2 → 39.1) — основата беше main, чийто agents.json идваше от чуждо сливане с
// по-стара история, а от паметта се пренасяха само НОВИТЕ поуки. Версия никога не пада при сгъване.
test("keepHigherVersions: при сгъване версията на агент не пада под тази в паметта", async () => {
  const { keepHigherVersions } = await lib();
  const ev = (...vs) => vs.map((v) => ({ version: v, date: "2026-09-25", event: `v${v}` }));
  const result = { agents: [{ id: "a", evolution: ev("19.0.0", "19.8.0") }, { id: "b", evolution: ev("5.0.0") }] };
  const memory = { agents: [{ id: "a", evolution: ev("19.0.0", "20.0.0", "20.1.0") }, { id: "b", evolution: ev("4.9.0") }] };
  assert.equal(keepHigherVersions(result, memory), true, "има промяна");
  assert.equal(result.agents[0].evolution.at(-1).version, "20.1.0", "по-високата история на паметта печели");
  assert.equal(result.agents[1].evolution.at(-1).version, "5.0.0", "по-високата в основата също се пази");
  assert.equal(keepHigherVersions(result, memory), false, "идемпотентно");
});
