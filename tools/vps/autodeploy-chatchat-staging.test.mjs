// autodeploy-chatchat-staging.test.mjs — проектът chatchat-staging в autodeploy.sh: кодовете на
// chatchat/deploy/staging.sh, откатът към last-good на staging (без нов дъмп и без нова оценка), провалената
// миграция, червената оценка (провал без откат) и `current`, който пробег само със staging не мести.
// ИЗПЪЛНИМ: реже реалните функции от скрипта и ги пуска с bash; staging.sh е заглушка с избран код.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readlinkSync } from "node:fs";
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
  const base = mkdtempSync(join(tmpdir(), "chatchat-stg-auto-"));
  const L = { base, prod: join(base, "shared", "chatchat"), stg: join(base, "shared", "chatchat-staging"),
    releases: join(base, "releases"), current: join(base, "current"), log: join(base, "log.txt") };
  mkdirSync(L.releases, { recursive: true });
  mkdirSync(L.stg, { recursive: true });
  return L;
}
const withLayout = (body) => {
  const L = layout();
  try { body(L); } finally { rmSync(L.base, { recursive: true, force: true }); }
};
const stub = (L, name, rc, attempt) =>
  `echo "staging.sh ${name} skip=\${CHATCHAT_SKIP_BACKUP:-0} noeval=\${STAGING_SKIP_EVAL:-0} stg=\${CHATCHAT_STAGING_SHARED:-} prod=\${CHATCHAT_PROD_SHARED:-}" >> "${L.log}"\n` +
  (attempt ? `printf '%s\\n' "${attempt}" > "\${CHATCHAT_STAGING_SHARED}/last-attempt"\n` : "") + `exit ${rc}\n`;

// Release от архива: chatchat/deploy/staging.sh. Работното му копие (там, където staging.sh би го сложил).
function release(L, name, rc) {
  const src = join(L.releases, name, "few-few");
  const copy = join(L.stg, "releases", `copy-${name}`);
  mkdirSync(join(src, "chatchat", "deploy"), { recursive: true });
  mkdirSync(copy, { recursive: true });
  writeFileSync(join(copy, "docker-compose.yml"), "services: {}\n");
  writeFileSync(join(src, "chatchat", "deploy", "staging.sh"), stub(L, name, rc, copy));
  return { src, copy };
}
// Работно копие, минало оценката (last-good), със свой staging.sh (откатът го пуска на място).
function goodCopy(L, name, rc = 0) {
  const copy = join(L.stg, "releases", `good-${name}`);
  mkdirSync(join(copy, "deploy"), { recursive: true });
  writeFileSync(join(copy, "deploy", "staging.sh"), stub(L, `good-${name}`, rc));
  writeFileSync(join(L.stg, "last-good"), `${copy}\n`);
  return copy;
}
function run(L, src, appLogs = "") {
  const cfg = [
    "set -euo pipefail",
    `SRC="${src}"`, `CURRENT_LINK="${L.current}"`, `CHATCHAT_SHARED="${L.prod}"`,
    `CHATCHAT_STAGING_SHARED="${L.stg}"`, `CHATCHAT_STAGING_LAST_GOOD="${L.stg}/last-good"`, "deploy_failed=0",
    `log(){ :; }; ok(){ echo "OK $*" >> "${L.log}"; }; warn(){ echo "WARN $*" >> "${L.log}"; }`,
    `docker(){ echo "docker $*" >> "${L.log}"; printf '%s\\n' ${JSON.stringify(appLogs)}; }`,
    fn("chatchat_staging_migration_failed"), fn("chatchat_staging_rollback"), fn("deploy_chatchat_staging"),
    `deploy_chatchat_staging; echo "failed=$deploy_failed" >> "${L.log}"`,
  ].join("\n");
  execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
  return readFileSync(L.log, "utf8");
}

test("код 0: успех; staging.sh получава СВОЯТА папка и папката на продукцията само за пазачите", () => withLayout((L) => {
  const { src } = release(L, "new", 0);
  const log = run(L, src);
  assert.match(log, /staging\.sh new skip=0 noeval=0/);
  assert.ok(log.includes(`stg=${L.stg} prod=${L.prod}`), log);
  assert.match(log, /failed=0/);
}));

test("код 4: откат на място към last-good — без нов дъмп и без нова оценка; провалът остава", () => withLayout((L) => {
  goodCopy(L, "old");
  const { src } = release(L, "new", 4);
  const log = run(L, src);
  assert.match(log, /staging\.sh new skip=0 noeval=0[\s\S]*staging\.sh good-old skip=1 noeval=1/);
  assert.match(log, /OK chatchat-staging: предишният код отговаря/);
  assert.match(log, /failed=1/);
  assert.match(log, /docker compose -p chatchat-staging -f .*copy-new\/docker-compose\.yml logs/, "логовете — от опита, с изричния проект");
}));

test("код 4 от провалена миграция (P3018/P3009): без откат, сочи бекъпите на staging", () => withLayout((L) => {
  goodCopy(L, "old");
  const { src } = release(L, "new", 4);
  const log = run(L, src, "Error: P3018");
  assert.doesNotMatch(log, /good-old/);
  assert.match(log, /миграцията се провали/);
  assert.ok(log.includes(join(L.stg, "backups")), log);
  assert.match(log, /failed=1/);
}));

test("код 4 без last-good (пръв staging): вика човек, не пуска нищо друго", () => withLayout((L) => {
  const { src } = release(L, "new", 4);
  const log = run(L, src);
  assert.match(log, /няма предишен работещ staging/);
  assert.equal(log.match(/staging\.sh /g)?.length, 1);
  assert.match(log, /failed=1/);
}));

test("код 4, когато last-good е самият провалил се опит: без втори опит", () => withLayout((L) => {
  const { src, copy } = release(L, "new", 4);
  mkdirSync(join(copy, "deploy"), { recursive: true });
  writeFileSync(join(copy, "deploy", "staging.sh"), stub(L, "same", 0));
  writeFileSync(join(L.stg, "last-good"), `${copy}\n`);
  const log = run(L, src);
  assert.doesNotMatch(log, /staging\.sh same/);
  assert.match(log, /нужен е човек/);
}));

test("откат, който и той не отговаря: провал и вик за човек", () => withLayout((L) => {
  goodCopy(L, "old", 4);
  const log = run(L, release(L, "new", 4).src);
  assert.match(log, /откатът не тръгна — нужен е човек/);
  assert.match(log, /failed=1/);
}));

test("код 5 (червена оценка): провал БЕЗ откат — остава за преглед", () => withLayout((L) => {
  goodCopy(L, "old");
  const log = run(L, release(L, "new", 5).src);
  assert.doesNotMatch(log, /good-old/);
  assert.match(log, /оценката е червена/);
  assert.match(log, /failed=1/);
}));

test("код 1 (спрян преди смяната): провал без откат; код 3: пропуск", () => withLayout((L) => {
  goodCopy(L, "old");
  let log = run(L, release(L, "a", 1).src);
  assert.doesNotMatch(log, /good-old/);
  assert.match(log, /код 1/);
  assert.match(log, /failed=1/);
  rmSync(L.log);
  log = run(L, release(L, "b", 3).src);
  assert.match(log, /не е настроен/);
  assert.match(log, /failed=0/);
}));

test("архив без staging.sh: пропуск, не провал", () => withLayout((L) => {
  const src = join(L.releases, "x", "few-few");
  mkdirSync(join(src, "chatchat"), { recursive: true });
  const log = run(L, src);
  assert.match(log, /няма deploy\/staging\.sh/);
  assert.match(log, /failed=0/);
}));

// ── current: пробег само със staging не го мести; със смесени проекти — по старому ───────────────────
const currentBlock = (() => {
  const m = script.match(/^only_staging=1\n[\s\S]*?^fi\n/m);
  assert.ok(m, "блокът за current");
  return m[0];
})();
function moveCurrent(L, projects, failed = 0) {
  const old = join(L.releases, "old");
  const neu = join(L.releases, "new");
  mkdirSync(old, { recursive: true });
  mkdirSync(neu, { recursive: true });
  execFileSync("ln", ["-sfn", old, L.current]);
  const cfg = ["set -euo pipefail", `SRC="${neu}"`, `CURRENT_LINK="${L.current}"`, `PROJECTS="${projects}"`,
    `deploy_failed=${failed}`, `ok(){ echo "OK $*"; }; warn(){ echo "WARN $*"; }`, currentBlock].join("\n");
  const out = execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
  return { out, target: readlinkSync(L.current), old, neu };
}

test("само chatchat-staging: current остава на кода на продукцията", () => withLayout((L) => {
  const r = moveCurrent(L, "chatchat-staging");
  assert.equal(r.target, r.old);
  assert.match(r.out, /Само staging — current остава/);
}));

test("staging заедно с продукт: current се мести (както досега); при провал — не", () => withLayout((L) => {
  assert.equal(moveCurrent(L, "chatchat chatchat-staging").target, join(L.releases, "new"));
  assert.equal(moveCurrent(L, "chatchat", 1).target, join(L.releases, "old"));
}));

test("chatchat-staging НЕ е в PROJECTS по подразбиране; case-ът вика deploy_chatchat_staging", () => {
  const projects = /^PROJECTS="\$\{PROJECTS:-([^}]*)\}"/m.exec(script)?.[1] ?? "";
  assert.ok(!projects.split(" ").includes("chatchat-staging"), "main не отива в staging без изрично искане");
  assert.match(script, /^\s+chatchat-staging\) deploy_chatchat_staging ;;$/m);
  assert.ok(existsSync(join(root, "chatchat", "deploy", "staging.sh")));
});
