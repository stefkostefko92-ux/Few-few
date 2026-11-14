// conflict-guard.test.mjs — конфликтни маркери НЕ стигат до commit/push на паметта (ИСТИНСКИ git).
//
// Инцидент (2026-09-25, b82566b3ef): кука за учене спря rebase в конфликт, индексира agents.json,
// index.html и паметта С маркерите (`<<<<<<< HEAD` … `>>>>>>> c8227621c (auto: … научи …)`) и те
// стигнаха до main — agents.json стана невалиден JSON. Тук конфликтът е изкуствен, но git-ът е реален:
// rebase спира, човекът прави `git add -A` + `rebase --continue` (точно грешката) и пуска в main.
//
// Инварианти (всеки с мутация):
//  1. publishLessons върху замърсена основа → {ok:false, reason:"conflict"}, НУЛА commit-и/ref-ове;
//  2. куката (CLI) → exit 0 (не чупи сесията), видимо съобщение, нищо в работното дърво, нищо в клона;
//  3. sync със замърсен main → не сгъва и НЕ пуска; отдалеченият agents/memory остава чист;
//  4. отворен rebase в работното дърво → резервният път не пише там и НЕ прекратява чуждия rebase.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withMutation, MutationNotApplied } from "../lib/mutation.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = join(REPO, "tools", "lib", "memory-branch.mjs");
const GUARD = join(REPO, "tools", "lib", "conflict-guard.mjs");
const CAPTURE = join(REPO, ".claude", "hooks", "memory-capture.mjs");
const MEM = ".claude/agents/_memory/testagent.md";
const DASH = "agents-dashboard/agents.json";
const ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_NOSYSTEM: "1", GIT_EDITOR: "true" };
let n = 0;
const lib = () => import(pathToFileURL(LIB).href + `?v=${++n}`);
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
const MARK = /^(<<<<<<<|>>>>>>>)( |$)/m;
/** Пуска куката като SubagentStop с learn блок за `agent`. */
function capture(f, agent, text) {
  const transcript = join(f.root, `t-${++n}.jsonl`);
  const block = `\`\`\`learn\nagent: ${agent}\ndate: 2026-10-11\nlessons:\n  - text: ${text}\n    confidence: verified\n    source: https://web.dev/articles/lcp\n    scope: тест\n\`\`\``;
  writeFileSync(transcript, JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: block }] } }) + "\n");
  const env = { ...process.env, ...ENV, CLAUDE_PROJECT_DIR: f.work, AGENT_MEMORY_SYNC: "0" };
  return spawnSync(process.execPath, [CAPTURE], { input: JSON.stringify({ transcript_path: transcript }), encoding: "utf8", env });
}

function dash(detail) {
  return { meta: {}, agents: [{ id: "testagent", knowledge: { lessons: 1 }, evolution: [{ version: "1.0.0", date: "2026-01-01", event: "Раждане", detail }], activity: [] }] };
}
function writeState(dir, lesson, detail) {
  writeFileSync(join(dir, MEM), `# Памет\n\n## Проверени поуки (verified)\n${lesson}\n\n## Карантина (непроверени — НЕ са факт)\n`);
  writeFileSync(join(dir, DASH), JSON.stringify(dash(detail), null, 2) + "\n");
  writeFileSync(join(dir, "agents-dashboard", "index.html"), `<script>\nconst FALLBACK = ${JSON.stringify(dash(detail))};\n</script>\n`);
}

/** bare origin + работен клон; чиста памет + табло на main. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "conflictguard-"));
  const origin = join(root, "origin.git"), work = join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  mkdirSync(join(work, ".claude", "agents", "_memory"), { recursive: true });
  mkdirSync(join(work, "agents-dashboard"), { recursive: true });
  git(work, "init", "-q", "-b", "main");
  git(work, "config", "commit.gpgsign", "false");
  writeState(work, L("2026-01-01", "основна поука"), "-");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "init");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-q", "origin", "main");
  git(work, "fetch", "-q", "origin");
  return { root, origin, work };
}

/**
 * Изкуствен конфликт в клон `dir`: две страни пипат един и същ ред в паметта и таблото → `git rebase`
 * спира. Връща се с ОТВОРЕН rebase и маркери в работното дърво.
 */
function openRebaseConflict(dir) {
  git(dir, "checkout", "-q", "-b", "auto-learn");
  writeState(dir, L("2026-09-25", "поука от куката"), "кука");
  git(dir, "commit", "-q", "-am", "auto: testagent научи — памет + версия + табло");
  git(dir, "checkout", "-q", "main");
  writeState(dir, L("2026-09-25", "поука от друга сесия"), "друга");
  git(dir, "commit", "-q", "-am", "main напредва");
  git(dir, "checkout", "-q", "auto-learn");
  const r = git(dir, "rebase", "main");
  assert.notEqual(r.status, 0, "rebase-ът трябва да спре в конфликт: " + r.out);
  assert.match(readFileSync(join(dir, DASH), "utf8"), MARK, "маркерите са в agents.json");
}

/** Точно грешката от инцидента: индексирай всичко и довърши rebase-а → main със счупен agents.json. */
function poisonMain(f) {
  const human = join(f.root, "human");
  git(f.root, "clone", "-q", f.origin, human);
  git(human, "config", "commit.gpgsign", "false");
  openRebaseConflict(human);
  git(human, "add", "-A");
  const c = git(human, "rebase", "--continue");
  assert.equal(c.status, 0, "git приема индексиран файл с маркери за решен: " + c.out);
  assert.equal(git(human, "push", "-q", "origin", "HEAD:main").status, 0);
  git(f.work, "fetch", "-q", "origin");
  assert.match(git(f.work, "show", `origin/main:${DASH}`).out, MARK, "main е замърсен (възпроизведен инцидент)");
}

test("чисто: contentProblems хваща маркери с номер на ред и невалиден JSON; не вдига фалшива тревога", async () => {
  const { contentProblems, filesProblems } = await import(pathToFileURL(GUARD).href);
  const conflicted = "a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> abc (msg)\n";
  const p = contentProblems("x.md", conflicted);
  assert.equal(p.length, 1);
  assert.match(p[0], /x\.md:2,6/);
  assert.equal(contentProblems("y.json", '{"a":1}').length, 0);
  assert.match(contentProblems("y.json", '{"a":\n<<<<<<< HEAD\n1').join(";"), /невалиден JSON/);
  assert.equal(contentProblems("z.md", "Заглавие\n=======\nтекст\n").length, 0, "setext заглавие (само =======) не е конфликт");
  assert.equal(contentProblems("z.md", "поука за `<<<<<<< HEAD` в текста\n").length, 0, "споменаване в средата на ред не е маркер");
  assert.equal(filesProblems({ "a.md": "ok\n", "b.json": "{}" }).length, 0);
});

test("1. publishLessons върху main с маркери → отказ, нула commit-и, нула ref-ове", async () => {
  const f = fixture();
  try {
    poisonMain(f);
    const { publishLessons } = await lib();
    const r = publishLessons(f.work, { testagent: { verified: [L("2026-10-11", "нова поука")] } }, { date: "2026-10-11" });
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.equal(r.reason, "conflict");
    assert.ok(r.problems.some((x) => x.includes(MEM) || x.includes(DASH)), r.problems.join("; "));
    assert.notEqual(git(f.work, "rev-parse", "-q", "--verify", "refs/heads/agents/memory").status, 0, "клонът на паметта НЕ е създаден");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("1м. МУТАЦИЯ: без предпазителя commit-ът носи маркерите (тестът хапе)", async () => {
  const f = fixture();
  try {
    poisonMain(f);
    const { publishLessons } = await mutantLib((s) => s
      .replace("  assertCleanFiles(files);\n", "")
      .replace("    if (bad.length) throw new ConflictContentError(bad);\n", ""));
    const r = publishLessons(f.work, { testagent: { verified: [L("2026-10-11", "нова поука")] } }, { date: "2026-10-11" });
    assert.equal(r.ok, true, "мутантът комитва");
    assert.match(git(f.work, "show", `agents/memory:${MEM}`).out, MARK, "маркерите влизат в клона на паметта — точно инцидентът");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("2. куката (CLI): exit 0, видим отказ, работното дърво и клонът — непокътнати", () => {
  const f = fixture();
  try {
    poisonMain(f);
    git(f.work, "merge", "-q", "--ff-only", "origin/main"); // работното дърво носи замърсения main
    const before = git(f.work, "status", "--porcelain").out;
    const memBefore = readFileSync(join(f.work, MEM), "utf8");
    const c = capture(f, "testagent", "поука върху замърсена основа");
    assert.equal(c.status, 0, "куката е fail-open — не чупи сесията");
    assert.match(c.stderr, /конфликтни маркери/, "отказът е видим");
    assert.equal(git(f.work, "status", "--porcelain").out, before, "резервният път НЕ пише в работното дърво");
    assert.equal(readFileSync(join(f.work, MEM), "utf8"), memBefore);
    assert.notEqual(git(f.work, "rev-parse", "-q", "--verify", "refs/heads/agents/memory").status, 0, "нищо в клона на паметта");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("3. sync: замърсен main НЕ се сгъва и НЕ се пуска; отдалеченият agents/memory остава чист", async () => {
  const f = fixture();
  try {
    const { publishLessons, syncMemoryBranch } = await lib();
    publishLessons(f.work, { testagent: { verified: [L("2026-10-10", "чиста поука")] } }, { date: "2026-10-10" });
    assert.equal(syncMemoryBranch(f.work, { date: "2026-10-10" }).pushed, true);
    const remoteBefore = git(f.work, "rev-parse", "origin/agents/memory").out;
    poisonMain(f);
    const r = syncMemoryBranch(f.work, { date: "2026-10-11" });
    assert.equal(r.ok, false, r.steps.join(" · "));
    assert.equal(r.conflict, true);
    assert.match(r.steps.join(" · "), /ОТКАЗ/);
    git(f.work, "fetch", "-q", "origin");
    assert.equal(git(f.work, "rev-parse", "origin/agents/memory").out, remoteBefore, "нищо не е пуснато");
    assert.doesNotMatch(git(f.work, "show", `origin/agents/memory:${DASH}`).out, MARK);
    // CLI-то казва ясно и излиза с 1 (за човек/лог), без да хвърля.
    const cli = spawnSync(process.execPath, [LIB, "--sync", "--no-fetch"], { cwd: f.work, encoding: "utf8", env: { ...process.env, ...ENV, CLAUDE_PROJECT_DIR: f.work } });
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /✗ agents\/memory: .*ОТКАЗ/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("3м. МУТАЦИЯ: без вратата преди push замърсеният връх се пуска (тестът хапе)", async () => {
  const f = fixture();
  try {
    const { publishLessons, syncMemoryBranch } = await lib();
    publishLessons(f.work, { testagent: { verified: [L("2026-10-10", "чиста поука")] } }, { date: "2026-10-10" });
    syncMemoryBranch(f.work, { date: "2026-10-10" });
    // Слят PR + замърсен main след него → sync „догонва“ main без наш commit; само вратата преди push пази.
    const human = join(f.root, "human");
    git(f.root, "clone", "-q", f.origin, human);
    git(human, "config", "commit.gpgsign", "false");
    git(human, "merge", "-q", "--ff-only", "origin/agents/memory");
    writeFileSync(join(human, DASH), "<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> x (auto)\n");
    git(human, "commit", "-q", "-am", "счупен main");
    git(human, "push", "-q", "origin", "HEAD:main");
    const good = syncMemoryBranch(f.work, { date: "2026-10-11" });
    assert.equal(good.pushed ?? false, false, "истинският код не пуска: " + good.steps.join(" · "));
    const { syncMemoryBranch: mutSync } = await mutantLib((s) => s.replace("    if (bad.length) return { ok: false, conflict: true, problems: bad, tip,", "    if (false) return { ok: false, conflict: true, problems: bad, tip,"));
    const bad = mutSync(f.work, { date: "2026-10-11" });
    assert.equal(bad.pushed, true, "мутантът пуска замърсения връх: " + bad.steps.join(" · "));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("4. отворен rebase в работното дърво: резервният път не пише там и НЕ прекратява чуждия rebase", () => {
  const f = fixture();
  try {
    openRebaseConflict(f.work);
    git(f.work, "add", "-A"); // човекът е индексирал, но още не е довършил
    // Нов агент, когото основата (origin/main) не познава → publishLessons го пропуска → резервен път.
    const fresh = ".claude/agents/_memory/novak.md";
    writeFileSync(join(f.work, fresh), "# Памет\n\n## Проверени поуки (verified)\n\n## Карантина (непроверени — НЕ са факт)\n");
    const freshBefore = readFileSync(join(f.work, fresh), "utf8");
    const dashBefore = readFileSync(join(f.work, DASH), "utf8");
    const c = capture(f, "novak", "поука по време на rebase");
    assert.equal(c.status, 0);
    assert.match(c.stderr, /незавършена git операция \(rebase-merge\)/);
    assert.equal(readFileSync(join(f.work, fresh), "utf8"), freshBefore, "паметта в работното дърво — непокътната");
    assert.equal(readFileSync(join(f.work, DASH), "utf8"), dashBefore, "таблото в работното дърво — непокътнато");
    const gitDir = git(f.work, "rev-parse", "--absolute-git-dir").out;
    assert.ok(existsSync(join(gitDir, "rebase-merge")), "rebase-ът на човека НЕ е прекратен (разрешените му конфликти остават)");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("2м/4м. МУТАЦИЯ: куката без отказите пише маркери/поуки в работното дърво (тестът хапе)", () => {
  // 2м: без отказа при reason=conflict резервният път слага поуката до маркерите в работното дърво.
  let f = fixture();
  try {
    poisonMain(f);
    git(f.work, "merge", "-q", "--ff-only", "origin/main");
    const before = git(f.work, "status", "--porcelain").out;
    withMutation(CAPTURE, (s) => s
      .replace('if (published?.reason === "conflict") {', "if (false) {")
      .replace("if (dirty.length) {", "if (false) {"), () => capture(f, "testagent", "поука на мутанта"));
    assert.notEqual(git(f.work, "status", "--porcelain").out, before, "мутантът пише в работното дърво — пътят на инцидента");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
  // 4м: без проверката за спряна операция резервният път пише по средата на rebase-а на човека.
  f = fixture();
  try {
    openRebaseConflict(f.work);
    const fresh = join(f.work, ".claude/agents/_memory/novak.md");
    writeFileSync(fresh, "# Памет\n\n## Проверени поуки (verified)\n\n## Карантина (непроверени — НЕ са факт)\n");
    const freshBefore = readFileSync(fresh, "utf8");
    withMutation(CAPTURE, (s) => s.replace("if (op) {", "if (false) {"), () => capture(f, "novak", "поука на мутанта по време на rebase"));
    assert.notEqual(readFileSync(fresh, "utf8"), freshBefore, "мутантът пише по средата на rebase");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
