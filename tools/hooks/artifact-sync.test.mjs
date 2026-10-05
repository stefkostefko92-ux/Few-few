// artifact-sync.test.mjs — „агентите научиха → артефактът се обновява ВИНАГИ" (решение на собственика,
// 2026-09-23). Куката не може сама да публикува, затова налага реда: сесия с ново учене не спира тихо.
// Плюс: билдът чете дървото на agents/memory (иначе артефактът не вижда нищо научено след merge).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withMutation } from "../lib/mutation.mjs";
import { publishLessons } from "../lib/memory-branch.mjs";
import { build, dashReader, ARTIFACT_URL } from "../docs/build-artifact.mjs";
import { parseFallback } from "../lib/dashboard-fallback.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(REPO, ".claude", "hooks", "artifact-sync.mjs");
const BUILD = join(REPO, "tools", "docs", "build-artifact.mjs");
const ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, ...ENV } }).stdout.trim();
const L = (t) => `- **2026-09-23:** ${t} _(тест; verified; https://example.org/doc)_`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "artsync-"));
  const origin = join(root, "origin.git"), work = join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  mkdirSync(join(work, ".claude/agents/_memory"), { recursive: true });
  mkdirSync(join(work, "agents-dashboard"), { recursive: true });
  git(work, "init", "-q", "-b", "main");
  writeFileSync(join(work, ".claude/agents/_memory/testagent.md"), "# Памет\n\n## Проверени поуки (verified)\n\n## Карантина\n");
  writeFileSync(join(work, "agents-dashboard/agents.json"), JSON.stringify({ agents: [{ id: "testagent", knowledge: { lessons: 0 }, evolution: [{ version: "1.0.0" }], activity: [] }] }) + "\n");
  git(work, "add", "-A"); git(work, "commit", "-q", "-m", "init");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-q", "origin", "main");
  git(work, "fetch", "-q", "origin");
  return { root, origin, work };
}
const stop = (cwd, payload = {}) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: cwd } });

test("без учене в тази сесия → спира свободно (дори ако origin/agents/memory съществува)", () => {
  const f = fixture();
  try {
    assert.equal(stop(f.work).status, 0, "нищо научено");
    publishLessons(f.work, { testagent: { verified: [L("поука от друга сесия")] } });
    git(f.work, "push", "-q", "origin", "agents/memory");
    const fresh = join(f.root, "fresh");
    git(f.root, "clone", "-q", f.origin, fresh);
    assert.ok(git(fresh, "rev-parse", "origin/agents/memory"), "новият clone вижда отдалечения клон на паметта");
    assert.equal(stop(fresh).status, 0, "нов clone без учене НЕ бива да иска публикуване");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ново учене → връща сесията ВЕДНЪЖ с адреса и върха; след --mark-published — свободно", () => {
  const f = fixture();
  try {
    const r0 = publishLessons(f.work, { testagent: { verified: [L("нова поука")] } });
    const r = stop(f.work);
    assert.equal(r.status, 2, "сесията се връща");
    assert.ok(r.stderr.includes(ARTIFACT_URL), "казва СЪЩИЯ адрес");
    assert.ok(r.stderr.includes(`--mark-published ${r0.commit}`), "казва точния връх");
    assert.equal(stop(f.work, { stop_hook_active: true }).status, 0, "второ спиране → само напомняне (без цикъл)");
    const m = spawnSync(process.execPath, [BUILD, "--mark-published", r0.commit], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: f.work } });
    assert.equal(m.status, 0, m.stderr);
    assert.equal(stop(f.work).status, 0, "публикуваният връх е отбелязан");
    assert.equal(git(f.work, "status", "--porcelain"), "", "състоянието е в .git — нищо за комитване");
    publishLessons(f.work, { testagent: { verified: [L("още една поука")] } });
    assert.equal(stop(f.work).status, 2, "следващото учене пак изисква обновяване");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("МУТАЦИЯ: кука, която гледа и отдалечения клон, иска публикуване от всяка нова сесия (тестът хапе)", () => {
  const f = fixture();
  try {
    publishLessons(f.work, { testagent: { verified: [L("поука от друга сесия")] } });
    git(f.work, "push", "-q", "origin", "agents/memory");
    const fresh = join(f.root, "fresh");
    git(f.root, "clone", "-q", f.origin, fresh);
    const st = withMutation(HOOK, (s) => s.replace('"refs/heads/agents/memory^{commit}"', '"refs/remotes/origin/agents/memory^{commit}"'), () => stop(fresh).status);
    assert.equal(st, 2, "мутантът спамва — точно причината да гледаме само локалния клон");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("билдът чете дървото на дадения връх, не работното дърво", () => {
  const head = git(REPO, "rev-parse", "HEAD");
  const r = build(join(REPO, "agents-dashboard"), dashReader(head, REPO));
  const fb = parseFallback(git(REPO, "show", `${head}:agents-dashboard/index.html`));
  const sum = fb.agents.reduce((t, a) => t + (a.knowledge?.lessons || 0), 0);
  assert.equal(r.lessons, sum, "сумата в артефакта = сумата във FALLBACK на този връх");
  assert.equal(r.icons, 28);
});
