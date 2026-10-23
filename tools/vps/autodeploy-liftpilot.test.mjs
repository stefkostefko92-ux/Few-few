// autodeploy-liftpilot.test.mjs — обвивката на LiftPilot в autodeploy.sh (кръг 48, 2026-10-16): паметта за последния
// здрав release (last-good, .prev, връзката liftpilot-current), връщането назад (RELEASE_DIR не пише лошия код в .prev),
// провалът, когато LiftPilot е поискан по име, а го няма в архива, и чистенето на releases, което пази трите му пътя.
//
// Стъпките на деплоя (тайни, бекъп, build/up, миграции, nginx) са в liftpilot/deploy/deploy.sh. Тук: какво прави
// autodeploy с изхода му. Тестът е ИЗПЪЛНИМ: реже реалните функции от скрипта и ги пуска с bash върху временна
// файлова система; deploy.sh на всеки release, docker и сондата са заглушки.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, utimesSync, readlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = readFileSync(join(root, "deploy", "autodeploy.sh"), "utf8");
const fn = (name) => {
  const m = script.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `функцията ${name} съществува`);
  return m[0];
};

function layout() {
  const base = mkdtempSync(join(tmpdir(), "liftpilot-"));
  const L = { base, releases: join(base, "releases"), current: join(base, "current"), link: join(base, "liftpilot-current"),
    lastGood: join(base, "shared", "liftpilot", "last-good"), env: join(base, "shared", "liftpilot", ".env"),
    bin: join(base, "bin"), log: join(base, "log.txt") };
  for (const p of [L.releases, L.bin, dirname(L.lastGood)]) mkdirSync(p, { recursive: true });
  writeFileSync(L.env, "APP_PORT=4330\n");
  // `command -v docker` в deploy_liftpilot
  writeFileSync(join(L.bin, "docker"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return L;
}
// Release с liftpilot/deploy/deploy.sh, който записва кой е пуснат и излиза с `rc`.
function release(L, name, rc = 0) {
  const src = join(L.releases, name, "few-few");
  mkdirSync(join(src, "liftpilot", "deploy"), { recursive: true });
  writeFileSync(join(src, "liftpilot", "deploy", "deploy.sh"), `echo "deploy.sh ${name}" >> "${L.log}"\nexit ${rc}\n`);
  return src;
}
const lp = (src) => join(src, "liftpilot");
const head = (p) => (existsSync(p) ? readFileSync(p, "utf8").trim() : null);
const state = (L) => ({ lastGood: head(L.lastGood), prev: head(`${L.lastGood}.prev`), from: head(`${L.lastGood}.rolled-back-from`),
  link: existsSync(L.link) ? readlinkSync(L.link) : null });

// deploy_liftpilot с даден PROJECTS (изрично или не), сонда с код `healthRc` и по желание RELEASE_DIR (връщане назад).
function run(L, src, { given = "liftpilot", healthRc = 0, releaseDir = "" } = {}) {
  const cfg = [
    "set -euo pipefail",
    `export PATH="${L.bin}:$PATH"`,
    `SRC="${src}"`, `PROJECTS_GIVEN="${given}"`, `RELEASE_DIR="${releaseDir}"`,
    `LIFTPILOT_ENV="${L.env}"`, `LIFTPILOT_LAST_GOOD="${L.lastGood}"`, `LIFTPILOT_LINK="${L.link}"`, "deploy_failed=0",
    `log(){ :; }; ok(){ echo "OK $*" >> "${L.log}"; }; warn(){ echo "WARN $*" >> "${L.log}"; }`,
    `health(){ echo "health $1" >> "${L.log}"; return ${healthRc}; }`,
    fn("project_given"), fn("liftpilot_mark_good"), fn("deploy_liftpilot"),
    `deploy_liftpilot; echo "failed=$deploy_failed" >> "${L.log}"`,
  ].join("\n");
  execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
  return readFileSync(L.log, "utf8");
}
const withLayout = (body) => {
  const L = layout();
  try { body(L); } finally { rmSync(L.base, { recursive: true, force: true }); }
};

test("здрав деплой: last-good, .prev (досегашният) и връзката сочат истинските пътища", () => withLayout((L) => {
  const a = release(L, "a"), b = release(L, "b");
  let log = run(L, a);
  assert.match(log, /deploy\.sh a/);
  assert.match(log, /health http:\/\/127\.0\.0\.1:4330\/api\/health/);
  assert.match(log, /failed=0/);
  assert.deepEqual(state(L), { lastGood: lp(a), prev: null, from: null, link: lp(a) }, "първият: без .prev");
  log = run(L, b);
  assert.deepEqual(state(L), { lastGood: lp(b), prev: lp(a), from: null, link: lp(b) });
  // същият release наново: .prev не става самият той
  run(L, b);
  assert.deepEqual(state(L), { lastGood: lp(b), prev: lp(a), from: null, link: lp(b) });
}));

test("провалена сонда: last-good, .prev и връзката не мърдат, деплоят е провал", () => withLayout((L) => {
  const a = release(L, "a"), b = release(L, "b"), c = release(L, "c");
  run(L, a); run(L, b);
  const before = state(L);
  const log = run(L, c, { healthRc: 1 });
  assert.match(log, /deploy\.sh c/);
  assert.match(log, /failed=1/);
  assert.deepEqual(state(L), before, "last-good е още здравият b — целта на връщането след провал");
}));

test("провален deploy.sh: паметта не мърда, сонда не се пуска", () => withLayout((L) => {
  const a = release(L, "a"), b = release(L, "b", 1);
  run(L, a);
  rmSync(L.log, { force: true });
  const log = run(L, b);
  assert.doesNotMatch(log, /health/);
  assert.match(log, /DEPLOY\.md, раздел Връщане назад/);
  assert.match(log, /failed=1/);
  assert.deepEqual(state(L), { lastGood: lp(a), prev: null, from: null, link: lp(a) });
}));

test("връщане назад (RELEASE_DIR) след здрав, но лош деплой: .prev остава, лошият отива в .rolled-back-from", () => withLayout((L) => {
  const a = release(L, "a"), b = release(L, "b");
  run(L, a); run(L, b);
  // b е здрав, но кодът е лош: връщане към .prev = a
  run(L, a, { releaseDir: join(L.releases, "a") });
  assert.deepEqual(state(L), { lastGood: lp(a), prev: lp(a), from: lp(b), link: lp(a) },
    ".prev не става лошият b — второ пускане на същата команда разгръща пак a, не b");
  // следващ обикновен деплой: .prev = a, напомнянето за връщането се маха
  const c = release(L, "c");
  run(L, c);
  assert.deepEqual(state(L), { lastGood: lp(c), prev: lp(a), from: null, link: lp(c) });
}));

test("връщане назад след провален деплой (RELEASE_DIR = last-good): нищо в паметта не се сменя", () => withLayout((L) => {
  const a = release(L, "a"), b = release(L, "b"), c = release(L, "c");
  run(L, a); run(L, b); run(L, c, { healthRc: 1 });
  const before = state(L);
  run(L, b, { releaseDir: join(L.releases, "b") });
  assert.deepEqual(state(L), before);
  assert.deepEqual(before, { lastGood: lp(b), prev: lp(a), from: null, link: lp(b) });
}));

test("архив без liftpilot/: поискан по име — провал; в подразбиращия се списък — пропуск", () => withLayout((L) => {
  const src = join(L.releases, "main", "few-few");
  mkdirSync(src, { recursive: true });
  let log = run(L, src, { given: "liftpilot" });
  assert.match(log, /поискан е изрично/);
  assert.match(log, /failed=1/);
  rmSync(L.log, { force: true });
  log = run(L, src, { given: "medqr liftpilot" });
  assert.match(log, /failed=1/, "и сред други имена");
  rmSync(L.log, { force: true });
  log = run(L, src, { given: "" });
  assert.match(log, /Няма liftpilot\/ в архива — пропускам/);
  assert.match(log, /failed=0/);
  assert.deepEqual(state(L), { lastGood: null, prev: null, from: null, link: null });
}));

test("чистенето пази last-good, .prev и целта на връзката, дори да са извън последните KEEP_RELEASES", () => withLayout((L) => {
  const names = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"];
  const srcs = names.map((n, i) => {
    const src = release(L, n);
    const t = new Date(Date.UTC(2026, 9, 1 + i));
    utimesSync(join(L.releases, n), t, t);
    return src;
  });
  // .prev = r1, last-good = r2, връзката — към r3 (напр. ръчно преместена), current — към r9
  writeFileSync(`${L.lastGood}.prev`, `${lp(srcs[0])}\n`);
  writeFileSync(L.lastGood, `${lp(srcs[1])}\n`);
  execFileSync("ln", ["-sfn", lp(srcs[2]), L.link]);
  execFileSync("ln", ["-sfn", srcs[8], L.current]);
  const cfg = [
    "set -euo pipefail",
    `SRC="${srcs[8]}"`, `CURRENT_LINK="${L.current}"`, `KORPORA_LAST_GOOD="${join(L.base, "shared", "korpora", "last-good")}"`,
    `LIFTPILOT_LAST_GOOD="${L.lastGood}"`, `LIFTPILOT_LINK="${L.link}"`,
    `RELEASES_DIR="${L.releases}"`, "KEEP_RELEASES=5",
    fn("prune_releases"), "prune_releases",
  ].join("\n");
  execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
  for (const n of ["r1", "r2", "r3"]) assert.ok(existsSync(join(L.releases, n)), `${n} е защитен — остава`);
  assert.ok(!existsSync(join(L.releases, "r4")), "r4 е стар и незащитен — изтрит");
  for (const n of ["r5", "r6", "r7", "r8", "r9"]) assert.ok(existsSync(join(L.releases, n)), n);
}));

test("без настройките на LiftPilot (autodeploy.sh на main) чистенето трие папката — затова DEPLOY.md иска KEEP_RELEASES=50", () => withLayout((L) => {
  const srcs = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"].map((n, i) => {
    const src = release(L, n);
    const t = new Date(Date.UTC(2026, 9, 1 + i));
    utimesSync(join(L.releases, n), t, t);
    return src;
  });
  writeFileSync(L.lastGood, `${lp(srcs[0])}\n`);
  execFileSync("ln", ["-sfn", lp(srcs[0]), L.link]);
  execFileSync("ln", ["-sfn", srcs[6], L.current]);
  const prune = (keep) => execFileSync("bash", ["-c", [
    "set -euo pipefail",
    `SRC="${srcs[6]}"`, `CURRENT_LINK="${L.current}"`, `KORPORA_LAST_GOOD="${join(L.base, "none")}"`,
    `RELEASES_DIR="${L.releases}"`, `KEEP_RELEASES=${keep}`,
    fn("prune_releases"), "prune_releases",
  ].join("\n")], { encoding: "utf8" });
  prune(50);
  assert.ok(existsSync(join(L.releases, "r1")), "KEEP_RELEASES=50 — нищо не се трие");
  prune(5);
  assert.ok(!existsSync(join(L.releases, "r1")), "без LIFTPILOT_* и с 5 — целта на връзката е изтрита");
}));

test("liftpilot е в PROJECTS по подразбиране и case-ът вика deploy_liftpilot", () => {
  const projects = /^PROJECTS="\$\{PROJECTS:-([^}]*)\}"/m.exec(script)?.[1] ?? "";
  assert.ok(projects.split(" ").includes("liftpilot"), projects);
  assert.match(script, /^\s+liftpilot\)\s+deploy_liftpilot ;;$/m);
  assert.match(script, /^PROJECTS_GIVEN="\$\{PROJECTS:-\}"$/m, "изричният списък се помни преди подразбиращия се");
});
