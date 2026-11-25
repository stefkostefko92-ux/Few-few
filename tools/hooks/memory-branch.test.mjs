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
    const { publishLessons, syncMemoryBranch } = await mutantLib((s) => s.replace('const merged = b == null ? o : mergeLessons3(since ? show(cwd, since, path) || "" : "", o, b);', "const merged = b;"));
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

// Регресия 02.11.2026: сгъването на main взимаше ДЪРВОТО на main за паметта и пренасяше само ДОБАВЕНИТЕ в
// клона редове. Всяка редакция в agents/memory — промоция от Карантина, маркер ОПРОВЕРГАНА, курация, нов
// обхват — се губеше при следващото сгъване. Измерено: от вълната за обхвата (1177 реда) във върха бяха
// останали 9, от сутрешната пресверка (467) — 3. Курацията на main (тест 3) трябва да остане запазена.
test("3б. сгъването пази РЕДАКЦИИТЕ в клона на паметта: промоция, опровержение, курация", async () => {
  const f = fixture();
  try {
    const { publishLessons, syncMemoryBranch } = await lib();
    const Q1 = "- **2026-02-01:** поука за промоция _(тест; unverified; https://example.org/q1)_";
    const Q2 = "- **2026-02-02:** поука за опровергаване _(тест; unverified; https://example.org/q2)_";
    publishLessons(f.work, { testagent: { quarantine: [Q1, Q2] } });
    syncMemoryBranch(f.work, { date: "2026-09-23" });
    // Както в реалността (#240): PR-ът на паметта е слят в main — Q1 и Q2 са и в main.
    const human = clone(f, "human");
    git(human, "fetch", "-q", "origin");
    git(human, "merge", "-q", "--ff-only", "origin/agents/memory");
    git(human, "push", "-q", "origin", "main");
    syncMemoryBranch(f.work, { date: "2026-09-23" });
    // Пресверката и курацията стават В клона на паметта (worktree, както при promote.mjs/curate.mjs).
    const wt = join(f.root, "memwt");
    git(f.work, "worktree", "add", "-q", "--detach", wt, "origin/agents/memory");
    const file = join(wt, MEM);
    const V1 = "- **2026-02-01 (пресверена 2026-11-02):** поука за промоция _(тест; verified; https://example.org/q1)_";
    const R2 = "- **2026-02-02:** ОПРОВЕРГАНА 2026-11-02 (поправено) — поука за опровергаване _(тест; unverified; https://example.org/q2)_";
    let txt = readFileSync(file, "utf8").replace(Q1 + "\n", "").replace(Q2, R2).replace(L0 + "\n", "");
    txt = txt.replace(/(## Проверени поуки[^\n]*\n)/, `$1${V1}\n`);
    writeFileSync(file, txt);
    git(wt, "commit", "-q", "-am", "памет: пресверка + курация");
    git(wt, "push", "-q", "origin", "HEAD:agents/memory");
    git(f.work, "fetch", "-q", "origin");
    // main напредва: продукт + нова поука, научена в клон на задача и слята в main.
    git(human, "pull", "-q", "--ff-only", "origin", "main");
    const LM = L("2026-03-01", "поука, дошла през main");
    const mf = join(human, MEM);
    writeFileSync(mf, readFileSync(mf, "utf8").replace(/(## Проверени поуки[^\n]*\n)/, `$1${LM}\n`));
    writeFileSync(join(human, "product.txt"), "продукт\n");
    git(human, "add", "-A");
    git(human, "commit", "-q", "-m", "продукт + поука");
    git(human, "push", "-q", "origin", "main");

    const r = syncMemoryBranch(f.work, { date: "2026-11-02" });
    assert.ok(r.steps.includes("сгънат main"), r.steps.join(" · "));
    const mem = memAt(f.work, "origin/agents/memory");
    const quarantine = mem.split(/^## Карантина.*$/m)[1] || "";
    assert.ok(mem.includes(V1), "промоцията в проверените оцелява");
    assert.ok(!quarantine.includes(Q1), "промотираната поука НЕ се връща в Карантина");
    assert.ok(mem.includes(R2), "маркерът ОПРОВЕРГАНА оцелява");
    assert.ok(!mem.includes(Q2), "неопровергарното копие не се връща");
    assert.ok(!mem.includes(L0), "курацията в клона на паметта не се връща");
    assert.ok(mem.includes(LM), "поуката от main е пренесена");
    assert.equal(git(f.work, "show", "origin/agents/memory:product.txt").out, "продукт", "продуктовото дърво е на main");
    assert.equal(git(f.work, "merge-base", "--is-ancestor", "origin/main", "origin/agents/memory").status, 0, "PR-ът остава бърз");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("3бм. МУТАЦИЯ: старото сгъване (файлът на main + добавените редове) губи промоцията (тестът хапе)", async () => {
  const { mergeLessons3 } = await import(pathToFileURL(join(REPO, "tools", "lib", "memory-core.mjs")).href);
  const base = "## Проверени поуки (verified)\n\n## Карантина\n- **2026-02-01:** поука _(т; unverified; https://e.org/q)_\n";
  const ours = "## Проверени поуки (verified)\n- **2026-02-01 (пресверена 2026-11-02):** поука _(т; verified; https://e.org/q)_\n\n## Карантина\n";
  const theirs = base.replace("## Карантина\n", "## Карантина\n- **2026-03-01:** нова от main _(т; unverified; https://e.org/m)_\n");
  const good = mergeLessons3(base, ours, theirs);
  assert.match(good, /пресверена 2026-11-02/);
  assert.doesNotMatch(good.split("## Карантина")[1], /2026-02-01/, "промотираната не се връща в Карантина");
  assert.match(good, /нова от main/);
  // Старото поведение: основата е файлът на main, от другата страна се пренасят само добавените редове.
  const { addLessons, sectionLessons } = await import(pathToFileURL(join(REPO, "tools", "lib", "memory-core.mjs")).href);
  const old = addLessons(theirs, { verified: sectionLessons(ours, "verified"), quarantine: sectionLessons(ours, "quarantine") }).txt;
  assert.match(old.split("## Карантина")[1], /2026-02-01/, "мутантът връща промотираната в Карантина");
});

// Инцидент 2026-11-15 (сгъване на main след PR #359): предшественикът имаше почти-дубли A и B на една
// поука; клонът на задачата махна дублите и запази A, паметта — B (с нов обхват). „Махнато от theirs“ = B,
// а A не е „добавено“ (беше в предшественика) → поуката изчезна от двете страни. 6 поуки (Изпитателя 4,
// Кодаджията 2). Правило: щом и двете страни още държат вариант на поуката, резултатът пази поне един.
const DOC = (v) => `## Проверени поуки (verified)\n${v.join("\n")}${v.length ? "\n" : ""}\n## Карантина\n`;
const VA = "- **2026-09-24:** CSPos гейтът падаше само заради липсващ node_modules _(global; verified; npm ci)_";
const VB = "- **2026-09-24:** CSPos гейтът падаше само заради липсващ node_modules _(при червен продуктов гейт в пясъчница; verified; npm ci)_";

test("3в. почти-дубли: всяка страна пази РАЗЛИЧЕН вариант → поуката оцелява (точно един, на паметта)", async () => {
  const { mergeLessons3, sectionLessons } = await import(pathToFileURL(join(REPO, "tools", "lib", "memory-core.mjs")).href);
  const out = mergeLessons3(DOC([VA, VB]), DOC([VB]), DOC([VA]));
  const v = sectionLessons(out, "verified");
  assert.equal(v.length, 1, `точно един вариант, получих ${v.length}: ${v.join(" | ")}`);
  assert.equal(v[0], VB, "вариантът на паметта (ours — по-новият обхват) печели");
});

test("3г. умишленото изтриване на ВСИЧКИ варианти остава изтриване (пазителят не връща курирано)", async () => {
  const { mergeLessons3, sectionLessons } = await import(pathToFileURL(join(REPO, "tools", "lib", "memory-core.mjs")).href);
  assert.equal(sectionLessons(mergeLessons3(DOC([VA]), DOC([VA]), DOC([])), "verified").length, 0, "theirs изтри поуката → няма я");
  assert.equal(sectionLessons(mergeLessons3(DOC([VA]), DOC([]), DOC([VA])), "verified").length, 0, "ours изтри поуката → няма я");
});

test("3д. дедуп от едната страна не връща дубъла, когато другата държи и двата варианта", async () => {
  const { mergeLessons3, sectionLessons } = await import(pathToFileURL(join(REPO, "tools", "lib", "memory-core.mjs")).href);
  const v = sectionLessons(mergeLessons3(DOC([VA, VB]), DOC([VA, VB]), DOC([VA])), "verified");
  assert.deepEqual(v, [VA], "theirs махна дубъла B → остава само A");
});

// Прегледът на AI-джията (#387): пазителят трябва да остави варианта НА МЯСТОТО му (редът в паметта е
// хронологията), да важи и в Карантина, и да не съживява опровергана поука.
const X = "- **2026-09-01:** първа съседна поука за подредбата _(global; verified; tools/x.mjs:1)_";
const Y = "- **2026-09-30:** последна съседна поука за подредбата _(global; verified; tools/y.mjs:1)_";
const DOCQ = (v, q) => `## Проверени поуки (verified)\n${v.join("\n")}${v.length ? "\n" : ""}\n## Карантина\n${q.join("\n")}${q.length ? "\n" : ""}`;
const R = "- **2026-09-24:** ОПРОВЕРГАНА 2026-11-10 (вече не е вярно — гейтът пада и с node_modules) — CSPos гейтът падаше само заради липсващ node_modules _(global; verified; npm ci)_";

test("3е. пазителят оставя варианта НА МЯСТОТО му, не го качва най-горе в раздела", async () => {
  const { mergeLessons3, sectionLessons } = await import(pathToFileURL(join(REPO, "tools", "lib", "memory-core.mjs")).href);
  const v = sectionLessons(mergeLessons3(DOC([X, VA, VB, Y]), DOC([X, VB, Y]), DOC([X, VA, Y])), "verified");
  assert.deepEqual(v, [X, VB, Y], "B стои между X и Y, както в паметта");
});

test("3ж. същото правило в Карантина: различни варианти → точно един, в Карантина", async () => {
  const { mergeLessons3, sectionLessons } = await import(pathToFileURL(join(REPO, "tools", "lib", "memory-core.mjs")).href);
  const out = mergeLessons3(DOCQ([], [VA, VB]), DOCQ([], [VB]), DOCQ([], [VA]));
  assert.deepEqual(sectionLessons(out, "quarantine"), [VB], "вариантът на паметта остава в Карантина");
  assert.equal(sectionLessons(out, "verified").length, 0, "нищо не изскача в проверените");
});

test("3з. опровергана поука не се съживява от неопровергания вариант на другата страна", async () => {
  const { mergeLessons3, sectionLessons, bodyKey } = await import(pathToFileURL(join(REPO, "tools", "lib", "memory-core.mjs")).href);
  assert.equal(bodyKey(R), bodyKey(VA), "предпоставка: маркерът не е част от тялото");
  const all = (t) => [...sectionLessons(t, "verified"), ...sectionLessons(t, "quarantine")];
  assert.deepEqual(all(mergeLessons3(DOC([VA]), DOC([R]), DOC([VA]))), [R], "паметта опроверга, main не пипа → опровергана");
  assert.deepEqual(all(mergeLessons3(DOC([VA]), DOC([VA]), DOC([R]))), [R], "main опроверга, паметта не пипа → опровергана");
  assert.deepEqual(all(mergeLessons3(DOC([VA]), DOC([R]), DOC([VB]))), [R], "паметта опроверга, main смени обхвата → опровергана");
  assert.deepEqual(all(mergeLessons3(DOC([VA]), DOC([VB]), DOC([R]))), [R], "main опроверга, паметта смени обхвата → опровергана");
});

test("4. кука → клон на паметта → следващият агент я вижда; клонът на задачата остава чист", async () => {
  const f = fixture();
  try {
    git(f.work, "checkout", "-q", "-b", "claude/task");
    const transcript = join(f.root, "t.jsonl");
    const block = "```learn\nagent: testagent\ndate: 2026-09-23\nlessons:\n  - text: поука от куката през клона на паметта\n    confidence: verified\n    source: https://web.dev/articles/lcp\n    scope: тест\n```";
    // Агентът е изтеглил източника си — „verified“ иска това (source-provenance.mjs, 31.10.2026).
    const fetched = JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "WebFetch", input: { url: "https://web.dev/articles/lcp" } }] } });
    writeFileSync(transcript, fetched + "\n" + JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: block }] } }) + "\n");
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

// Регресия 23.11.2026 (c6ddb80d96): обединяването локален ↔ отдалечен строеше дървото от `base`
// (отдалечения) и взимаше ВСИЧКИ непаметни пътища оттам. Локалният беше сгънал по-нов main (Фактурист 2.1),
// отдалеченият — не → върхът върна `fakturist/` на 2.0 (47 файла, −1501 реда) и `cs-revolution` App.jsx;
// main вече беше предшественик, сгъването не поправи нищо, а PR #451 занесе връщането в main.
// Инвариант: непаметните пътища се сливат ТРИСТРАННО (git merge-tree); конфликт там → отказ, нула commit.
const PROD = "p/stat.txt", CAMP = "p/campaign.ts", OLD = "p/old.txt";
const MEMORY_ONLY = [".claude/agents/_memory/testagent.md", "agents-dashboard/agents.json", "agents-dashboard/index.html"];
/** main с продукт v1 (сгънат в клона на паметта от първия sync). */
function productV1(f) {
  const human = clone(f, "human");
  mkdirSync(join(human, "p"), { recursive: true });
  writeFileSync(join(human, PROD), "11\n");
  writeFileSync(join(human, OLD), "старо\n");
  git(human, "add", "-A"); git(human, "commit", "-q", "-m", "продукт v1"); git(human, "push", "-q", "origin", "main");
  return human;
}
/** main → v2: променен, нов и изтрит продуктов файл. */
function productV2(human) {
  writeFileSync(join(human, PROD), "14\n");
  writeFileSync(join(human, CAMP), "export const campaign = 1;\n");
  rmSync(join(human, OLD));
  git(human, "add", "-A"); git(human, "commit", "-q", "-m", "продукт v2"); git(human, "push", "-q", "origin", "main");
}
/**
 * Два клона на паметта се разминават: единият е сгънал main v2, другият — не. `newer` казва кой е по-новият
 * (локалният в f.work или отдалеченият, пуснат от друга сесия). Връща резултата от sync в f.work.
 */
async function divergedFold(f, newer, mod) {
  const { publishLessons, syncMemoryBranch } = mod;
  const human = productV1(f);
  publishLessons(f.work, { testagent: { verified: [L("2026-11-23", "поука А преди разклоняването")] } });
  assert.equal(syncMemoryBranch(f.work, { date: "2026-11-23" }).pushed, true, "M1 пуснат");
  const other = clone(f, "other");
  productV2(human);
  if (newer === "local") {
    publishLessons(f.work, { testagent: { verified: [L("2026-11-23", "поука В от локалния")] } });
    const l = syncMemoryBranch(f.work, { date: "2026-11-23", push: false });
    assert.ok(l.steps.includes("сгънат main"), "локалният сгъва main v2: " + l.steps.join(" · "));
    publishLessons(other, { testagent: { verified: [L("2026-11-23", "поука Б от отдалечения")] } });
    assert.equal(syncMemoryBranch(other, { date: "2026-11-23", fetch: false }).pushed, true, "отдалеченият (без v2) пуснат");
  } else {
    publishLessons(other, { testagent: { verified: [L("2026-11-23", "поука Б от отдалечения")] } });
    const o = syncMemoryBranch(other, { date: "2026-11-23" });
    assert.ok(o.pushed && o.steps.includes("сгънат main"), "отдалеченият сгъва v2 и пуска: " + o.steps.join(" · "));
    publishLessons(f.work, { testagent: { verified: [L("2026-11-23", "поука В от локалния")] } });
  }
  return { human, r: syncMemoryBranch(f.work, { date: "2026-11-23" }) };
}
function assertProductKept(f, ref) {
  assert.equal(git(f.work, "show", `${ref}:${PROD}`).out, "14", `${ref}: продуктовата промяна на main v2 е запазена`);
  assert.equal(git(f.work, "cat-file", "-e", `${ref}:${CAMP}`).status, 0, `${ref}: новият файл на v2 е там`);
  assert.notEqual(git(f.work, "cat-file", "-e", `${ref}:${OLD}`).status, 0, `${ref}: изтритият във v2 файл не се връща`);
}

for (const newer of ["local", "remote"]) {
  test(`5${newer === "local" ? "а" : "б"}. разминати клони на паметта, по-новият main е в ${newer === "local" ? "ЛОКАЛНИЯ" : "ОТДАЛЕЧЕНИЯ"} → продуктът НЕ се връща`, async () => {
    const f = fixture();
    try {
      const { human, r } = await divergedFold(f, newer, await lib());
      assert.equal(r.ok, true, r.steps.join(" · "));
      assert.equal(r.pushed, true, r.steps.join(" · "));
      if (newer === "local") assert.ok(r.steps.includes("обединен с отдалечения"), r.steps.join(" · "));
      const tip = "origin/agents/memory";
      assertProductKept(f, tip);
      const mem = memAt(f.work, tip);
      for (const p of ["поука А", "поука Б", "поука В"]) assert.match(mem, new RegExp(p), `${p} оцелява`);
      git(f.work, "fetch", "-q", "origin");
      assert.equal(git(f.work, "merge-base", "--is-ancestor", "origin/main", tip).status, 0, "main е предшественик");
      assert.deepEqual(git(f.work, "diff", "--name-only", "origin/main", tip).out.split("\n").sort(), MEMORY_ONLY, "PR-ът носи само памет + табло");

      // Следващото сгъване (main напредва другаде) и сливането на PR-а пазят v2.
      writeFileSync(join(human, "other.txt"), "още\n");
      git(human, "add", "-A"); git(human, "commit", "-q", "-m", "още main"); git(human, "push", "-q", "origin", "main");
      const r2 = (await lib()).syncMemoryBranch(f.work, { date: "2026-11-23" });
      assert.ok(r2.ok && r2.steps.includes("сгънат main"), r2.steps.join(" · "));
      assertProductKept(f, tip);
      git(human, "fetch", "-q", "origin");
      assert.equal(git(human, "merge", "-q", "--ff-only", "origin/agents/memory").status, 0, "PR-ът е бърз");
      assert.equal(readFileSync(join(human, PROD), "utf8"), "14\n", "след сливането на PR-а main пази v2");
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

test("5м. МУТАЦИЯ: дървото на обединението от `base` (старото) връща продукта на v1 (тестът хапе)", async () => {
  const f = fixture();
  try {
    const mod = await mutantLib((s) => s.replace("return commitFiles(cwd, base, files, [other, base], message, mergedProductTree(cwd, base, other));", "return commitFiles(cwd, base, files, [other, base], message);"));
    const { r } = await divergedFold(f, "local", mod);
    assert.equal(r.ok, true, r.steps.join(" · "));
    assert.equal(git(f.work, "show", `origin/agents/memory:${PROD}`).out, "11", "мутантът тихо връща продукта — точно инцидентът c6ddb80d96");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("6. конфликт в продуктов път при обединяване → отказ, нула commit/ref/push (никога тихо една страна)", async () => {
  const f = fixture();
  try {
    const { publishLessons, syncMemoryBranch } = await lib();
    const human = productV1(f);
    publishLessons(f.work, { testagent: { verified: [L("2026-11-23", "поука А")] } });
    syncMemoryBranch(f.work, { date: "2026-11-23" });
    // Някой комитва продуктова промяна направо в agents/memory, а main сменя същия ред другояче.
    const other = clone(f, "other");
    git(other, "checkout", "-q", "-b", "agents/memory", "origin/agents/memory");
    writeFileSync(join(other, PROD), "99\n");
    git(other, "commit", "-q", "-am", "продукт направо в паметта");
    git(other, "push", "-q", "origin", "agents/memory");
    productV2(human);
    publishLessons(f.work, { testagent: { verified: [L("2026-11-23", "поука В")] } });
    const localBefore = git(f.work, "rev-parse", "agents/memory").out;
    const originBefore = git(other, "ls-remote", "origin", "refs/heads/agents/memory").out;
    const r = syncMemoryBranch(f.work, { date: "2026-11-23" });
    assert.equal(r.ok, false, r.steps.join(" · "));
    assert.equal(r.conflict, true);
    assert.ok(r.problems.some((p) => p.includes(PROD)), "отказът назовава продуктовия път: " + r.problems.join("; "));
    assert.equal(git(f.work, "rev-parse", "agents/memory").out, localBefore, "локалният клон не мърда");
    assert.equal(git(other, "ls-remote", "origin", "refs/heads/agents/memory").out, originBefore, "нищо не е пуснато");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("7. git без `merge-tree --write-tree` (стар git) → ясен отказ, нула commit (симулация с мутант)", async () => {
  const f = fixture();
  try {
    const { publishLessons } = await lib();
    publishLessons(f.work, { testagent: { verified: [L("2026-11-23", "поука А")] } });
    const other = clone(f, "other");
    publishLessons(other, { testagent: { verified: [L("2026-11-23", "поука Б")] } });
    (await lib()).syncMemoryBranch(other, { date: "2026-11-23" });
    git(f.work, "fetch", "-q", "origin", "+refs/heads/agents/memory:refs/remotes/origin/agents/memory");
    const before = git(f.work, "rev-parse", "agents/memory").out;
    const { syncMemoryBranch } = await mutantLib((s) => s.replace('const MERGE_TREE = ["merge-tree", "--write-tree"', 'const MERGE_TREE = ["merge-tree", "--write-tree-няма"'));
    assert.throws(() => syncMemoryBranch(f.work, { date: "2026-11-23", fetch: false, push: false }), /merge-tree --write-tree.*git ≥ 2\.38/);
    assert.equal(git(f.work, "rev-parse", "agents/memory").out, before, "клонът не мърда");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
