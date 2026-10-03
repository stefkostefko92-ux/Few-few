// autodeploy-rendetto.test.mjs — обвивката на Rendetto в autodeploy.sh: кодовете на
// rendetto/deploy/deploy.sh, паметта за последния работещ release и откатът (2026-10-03).
//
// Стъпките на деплоя (тайни, бекъп, build/up, сонда с маркер, nginx, IndexNow) са в
// rendetto/deploy/deploy.sh и се тестват там (rendetto/tests/deploy-script.test.ts). Тук: какво
// прави autodeploy с изхода му. Тестът е ИЗПЪЛНИМ: реже реалните функции от скрипта и ги пуска с
// bash върху временна файлова система; deploy.sh на всеки release е заглушка с избран код.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
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
  const base = mkdtempSync(join(tmpdir(), "rendetto-"));
  const L = { base, releases: join(base, "releases"), current: join(base, "current"),
    lastGood: join(base, "shared", "rendetto", "last-good"), log: join(base, "log.txt") };
  mkdirSync(L.releases, { recursive: true });
  return L;
}
// Release с rendetto/deploy/deploy.sh, който записва кой е пуснат и излиза с `rc`.
function release(L, name, rc) {
  const src = join(L.releases, name, "few-few");
  mkdirSync(join(src, "rendetto", "deploy"), { recursive: true });
  writeFileSync(join(src, "rendetto", "deploy", "deploy.sh"), `echo "deploy.sh ${name}" >> "${L.log}"\nexit ${rc}\n`);
  return src;
}
function run(L, src) {
  const cfg = [
    "set -euo pipefail",
    `SRC="${src}"`, `CURRENT_LINK="${L.current}"`, `RENDETTO_LAST_GOOD="${L.lastGood}"`, "deploy_failed=0",
    `log(){ :; }; ok(){ echo "OK $*" >> "${L.log}"; }; warn(){ echo "WARN $*" >> "${L.log}"; }`,
    fn("rendetto_rollback"), fn("deploy_rendetto"),
    `deploy_rendetto; echo "failed=$deploy_failed" >> "${L.log}"`,
  ].join("\n");
  execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
  return readFileSync(L.log, "utf8");
}
const lastGood = (L) => (existsSync(L.lastGood) ? readFileSync(L.lastGood, "utf8").trim() : null);
const withLayout = (body) => {
  const L = layout();
  try { body(L); } finally { rmSync(L.base, { recursive: true, force: true }); }
};

test("код 0: release-ът става последният работещ, деплоят е успешен", () => withLayout((L) => {
  const src = release(L, "new", 0);
  const log = run(L, src);
  assert.match(log, /deploy\.sh new/);
  assert.match(log, /failed=0/);
  assert.equal(lastGood(L), join(src, "rendetto"));
}));

test("код 3 (няма .env): пропуск, не провал — и паметта за работещия не се пипа", () => withLayout((L) => {
  const old = release(L, "old", 0);
  mkdirSync(dirname(L.lastGood), { recursive: true });
  writeFileSync(L.lastGood, `${join(old, "rendetto")}\n`);
  const log = run(L, release(L, "new", 3));
  assert.match(log, /не е настроена/);
  assert.match(log, /failed=0/);
  assert.equal(lastGood(L), join(old, "rendetto"));
}));

test("код 4: откат към последния работещ release, провалът остава (current не мърда)", () => withLayout((L) => {
  const old = release(L, "old", 0);
  mkdirSync(dirname(L.lastGood), { recursive: true });
  writeFileSync(L.lastGood, `${join(old, "rendetto")}\n`);
  const log = run(L, release(L, "new", 4));
  assert.match(log, /deploy\.sh new\n[\s\S]*deploy\.sh old/, "първо новият, после старият");
  assert.match(log, /OK rendetto: предишният код отговаря/);
  assert.match(log, /failed=1/);
  assert.equal(lastGood(L), join(old, "rendetto"), "паметта остава на работещия");
}));

test("код 4 без памет: откатът минава през current, ако той е друг release", () => withLayout((L) => {
  const old = release(L, "old", 0);
  execFileSync("ln", ["-sfn", old, L.current]);
  const log = run(L, release(L, "new", 4));
  assert.match(log, /deploy\.sh old/);
  assert.match(log, /failed=1/);
}));

test("код 4, когато паметта и current сочат самия провалил се release: без откат, вика човек", () => withLayout((L) => {
  const src = release(L, "new", 4);
  mkdirSync(dirname(L.lastGood), { recursive: true });
  writeFileSync(L.lastGood, `${join(src, "rendetto")}\n`);
  execFileSync("ln", ["-sfn", src, L.current]);
  const log = run(L, src);
  assert.equal(log.match(/deploy\.sh new/g)?.length, 1, "провалилият се не се пуска втори път");
  assert.match(log, /нужен е човек/);
  assert.match(log, /failed=1/);
}));

test("откат, който и той не отговаря: провал и вик за човек", () => withLayout((L) => {
  const old = release(L, "old", 4);
  mkdirSync(dirname(L.lastGood), { recursive: true });
  writeFileSync(L.lastGood, `${join(old, "rendetto")}\n`);
  const log = run(L, release(L, "new", 4));
  assert.match(log, /откатът не тръгна — нужен е човек/);
  assert.match(log, /failed=1/);
}));

test("код 1 (спрян преди смяната на контейнерите): провал без откат", () => withLayout((L) => {
  const old = release(L, "old", 0);
  mkdirSync(dirname(L.lastGood), { recursive: true });
  writeFileSync(L.lastGood, `${join(old, "rendetto")}\n`);
  const log = run(L, release(L, "new", 1));
  assert.doesNotMatch(log, /deploy\.sh old/);
  assert.match(log, /код 1/);
  assert.match(log, /failed=1/);
}));

test("архив без rendetto/: пропуск, не провал", () => withLayout((L) => {
  const src = join(L.releases, "new", "few-few");
  mkdirSync(src, { recursive: true });
  const log = run(L, src);
  assert.match(log, /Няма rendetto\/ в архива/);
  assert.match(log, /failed=0/);
}));

test("rendetto е в PROJECTS по подразбиране и case-ът вика deploy_rendetto", () => {
  const projects = /^PROJECTS="\$\{PROJECTS:-([^}]*)\}"/m.exec(script)?.[1] ?? "";
  assert.ok(projects.split(" ").includes("rendetto"), projects);
  assert.match(script, /^\s+rendetto\)\s+deploy_rendetto ;;$/m);
});
