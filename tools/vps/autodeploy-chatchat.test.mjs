// autodeploy-chatchat.test.mjs — обвивката на ChatChat в autodeploy.sh (по модела на korpora): кодовете на
// chatchat/deploy/deploy.sh, паметта за последния работещ release, откатът, провалената миграция, пазачът
// срещу откат към release отпреди pgvector и чистенето на releases, което пази целта на отката.
//
// Стъпките на деплоя (тайни, бекъп, build/up, сонда на /readyz, nginx, таймери) са в
// chatchat/deploy/deploy.sh. Тук: какво прави autodeploy с изхода му. Тестът е ИЗПЪЛНИМ: реже реалните
// функции от скрипта и ги пуска с bash върху временна файлова система; deploy.sh е заглушка с избран код.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, utimesSync } from "node:fs";
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
  const base = mkdtempSync(join(tmpdir(), "chatchat-"));
  const shared = join(base, "shared", "chatchat");
  const L = { base, shared, releases: join(base, "releases"), current: join(base, "current"),
    lastGood: join(shared, "last-good"), log: join(base, "log.txt") };
  mkdirSync(L.releases, { recursive: true });
  return L;
}
// Release с chatchat/deploy/deploy.sh, който записва кой е пуснат и излиза с `rc`; `pgvector` — дали
// compose-ът му е с новия образ на базата.
function release(L, name, rc, pgvector = true) {
  const src = join(L.releases, name, "few-few");
  mkdirSync(join(src, "chatchat", "deploy"), { recursive: true });
  writeFileSync(join(src, "chatchat", "deploy", "deploy.sh"),
    `echo "deploy.sh ${name} skip=\${CHATCHAT_SKIP_BACKUP:-0} shared=\${CHATCHAT_SHARED:-}" >> "${L.log}"\nexit ${rc}\n`);
  writeFileSync(join(src, "chatchat", "docker-compose.yml"),
    `services:\n  db:\n    image: ${pgvector ? "pgvector/pgvector:0.8.7-pg16" : "postgres:16-alpine"}\n`);
  return src;
}
function run(L, src, appLogs = "") {
  const cfg = [
    "set -euo pipefail",
    `SRC="${src}"`, `CURRENT_LINK="${L.current}"`, `CHATCHAT_LAST_GOOD="${L.lastGood}"`,
    `CHATCHAT_SHARED="${L.shared}"`, "deploy_failed=0",
    `log(){ :; }; ok(){ echo "OK $*" >> "${L.log}"; }; warn(){ echo "WARN $*" >> "${L.log}"; }`,
    `docker(){ printf '%s\\n' ${JSON.stringify(appLogs)}; }`,
    fn("chatchat_migration_failed"), fn("chatchat_migration_help"), fn("chatchat_rollback"), fn("deploy_chatchat"),
    `deploy_chatchat; echo "failed=$deploy_failed" >> "${L.log}"`,
  ].join("\n");
  execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
  return readFileSync(L.log, "utf8");
}
const remember = (L, src) => {
  mkdirSync(dirname(L.lastGood), { recursive: true });
  writeFileSync(L.lastGood, `${join(src, "chatchat")}\n`);
};
const pgvectorDone = (L) => {
  mkdirSync(L.shared, { recursive: true });
  writeFileSync(join(L.shared, ".db-pgvector"), "x\n");
};
const lastGood = (L) => (existsSync(L.lastGood) ? readFileSync(L.lastGood, "utf8").trim() : null);
const withLayout = (body) => {
  const L = layout();
  try { body(L); } finally { rmSync(L.base, { recursive: true, force: true }); }
};

test("код 0: release-ът става последният работещ, деплоят е успешен", () => withLayout((L) => {
  const src = release(L, "new", 0);
  const log = run(L, src);
  assert.match(log, /deploy\.sh new skip=0/);
  assert.ok(log.includes(`shared=${L.shared}`), "deploy.sh получава стабилния път на тайните");
  assert.match(log, /failed=0/);
  assert.equal(lastGood(L), join(src, "chatchat"));
}));

test("код 3 (няма .env): пропуск, не провал — и паметта за работещия не се пипа", () => withLayout((L) => {
  const old = release(L, "old", 0);
  remember(L, old);
  const log = run(L, release(L, "new", 3));
  assert.match(log, /не е настроена/);
  assert.match(log, /failed=0/);
  assert.equal(lastGood(L), join(old, "chatchat"));
}));

test("код 4: откат към последния работещ release без нов бекъп; провалът остава", () => withLayout((L) => {
  const old = release(L, "old", 0);
  remember(L, old);
  const log = run(L, release(L, "new", 4));
  assert.match(log, /deploy\.sh new skip=0[^\n]*\n[\s\S]*deploy\.sh old skip=1/, "първо новият, после старият с CHATCHAT_SKIP_BACKUP=1");
  assert.match(log, /OK chatchat: предишният код отговаря/);
  assert.match(log, /failed=1/);
  assert.equal(lastGood(L), join(old, "chatchat"), "паметта остава на работещия");
}));

test("код 4 от провалена миграция (P3009/P3018): без откат на кода, сочи бекъпа и вика човек", () => withLayout((L) => {
  const old = release(L, "old", 0);
  remember(L, old);
  const backups = join(L.shared, "backups");
  mkdirSync(backups, { recursive: true });
  writeFileSync(join(backups, "pre-deploy-20261009-101500.sql.gz"), "x");
  for (const logs of ["Error: P3018\nA migration failed to apply.", "Error: P3009\nmigrate found failed migrations"]) {
    rmSync(L.log, { force: true });
    const log = run(L, release(L, "new", 4), logs);
    assert.doesNotMatch(log, /deploy\.sh old/, "старият код спира на същата миграция — не го пускаме");
    assert.match(log, /миграцията на базата се провали/);
    assert.match(log, /pre-deploy-20261009-101500\.sql\.gz/);
    assert.match(log, /нужен е човек/);
    assert.ok(log.includes(`от ${join(old, "chatchat")}:`), "сочи папката на последния работещ release");
    assert.match(log, /CHATCHAT_SKIP_BACKUP=1/);
    assert.match(log, /failed=1/);
  }
}));

test("базата е на pgvector, а работещият release е отпреди него: без автоматичен откат, вика човек", () => withLayout((L) => {
  const old = release(L, "old", 0, false);
  remember(L, old);
  pgvectorDone(L);
  const log = run(L, release(L, "new", 4));
  assert.doesNotMatch(log, /deploy\.sh old/);
  assert.match(log, /отпреди pgvector/);
  assert.match(log, /нужен е човек/);
  assert.match(log, /failed=1/);
}));

test("release отпреди pgvector, но базата още не е минала: откатът е позволен", () => withLayout((L) => {
  const old = release(L, "old", 0, false);
  remember(L, old);
  const log = run(L, release(L, "new", 4));
  assert.match(log, /deploy\.sh old skip=1/);
}));

test("памет, чийто release липсва: не пада към current (непроверен код), вика човек", () => withLayout((L) => {
  const gone = release(L, "gone", 0);
  remember(L, gone);
  rmSync(join(L.releases, "gone"), { recursive: true, force: true });
  const cur = release(L, "cur", 0);
  execFileSync("ln", ["-sfn", cur, L.current]);
  const log = run(L, release(L, "new", 4));
  assert.doesNotMatch(log, /deploy\.sh cur/);
  assert.match(log, /нужен е човек/);
  assert.match(log, /failed=1/);
}));

test("код 4 без памет: откатът минава през current, ако той е друг release", () => withLayout((L) => {
  const old = release(L, "old", 0);
  execFileSync("ln", ["-sfn", old, L.current]);
  const log = run(L, release(L, "new", 4));
  assert.match(log, /deploy\.sh old/);
  assert.match(log, /failed=1/);
}));

test("код 4, когато паметта сочи самия провалил се release: без втори опит, вика човек", () => withLayout((L) => {
  const src = release(L, "new", 4);
  remember(L, src);
  const log = run(L, src);
  assert.equal(log.match(/deploy\.sh new/g)?.length, 1, "провалилият се не се пуска втори път");
  assert.match(log, /нужен е човек/);
  assert.match(log, /failed=1/);
}));

test("откат, който и той не отговаря: провал и вик за човек", () => withLayout((L) => {
  const old = release(L, "old", 4);
  remember(L, old);
  const log = run(L, release(L, "new", 4));
  assert.match(log, /откатът не тръгна — нужен е човек/);
  assert.match(log, /failed=1/);
}));

test("код 1 (спрян преди смяната на контейнерите): провал без откат", () => withLayout((L) => {
  const old = release(L, "old", 0);
  remember(L, old);
  const log = run(L, release(L, "new", 1));
  assert.doesNotMatch(log, /deploy\.sh old/);
  assert.match(log, /код 1/);
  assert.match(log, /failed=1/);
}));

test("архив без chatchat/: пропуск, не провал", () => withLayout((L) => {
  const src = join(L.releases, "new", "few-few");
  mkdirSync(src, { recursive: true });
  const log = run(L, src);
  assert.match(log, /Няма chatchat\/ в архива/);
  assert.match(log, /failed=0/);
}));

test("чистенето на releases пази целта на отката на chatchat И на korpora", () => withLayout((L) => {
  const names = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];
  const srcs = names.map((n, i) => {
    const src = release(L, n, 0);
    const t = new Date(Date.UTC(2026, 9, 1 + i));
    utimesSync(join(L.releases, n), t, t);
    return src;
  });
  remember(L, srcs[0]);
  const korporaGood = join(L.base, "korpora-last-good");
  writeFileSync(korporaGood, `${join(srcs[1], "korpora")}\n`);
  mkdirSync(join(srcs[1], "korpora"), { recursive: true });
  execFileSync("ln", ["-sfn", srcs[7], L.current]);
  const cfg = [
    "set -euo pipefail",
    `SRC="${srcs[7]}"`, `CURRENT_LINK="${L.current}"`, `KORPORA_LAST_GOOD="${korporaGood}"`,
    `CHATCHAT_LAST_GOOD="${L.lastGood}"`, `RELEASES_DIR="${L.releases}"`, "KEEP_RELEASES=5",
    fn("prune_releases"), "prune_releases",
  ].join("\n");
  execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
  assert.ok(existsSync(join(L.releases, "r1")), "r1 е целта на отката на chatchat — остава");
  assert.ok(existsSync(join(L.releases, "r2")), "r2 е целта на отката на korpora — остава");
  assert.ok(!existsSync(join(L.releases, "r3")), "r3 е стар и незащитен — изтрит");
  for (const n of ["r4", "r5", "r6", "r7", "r8"]) assert.ok(existsSync(join(L.releases, n)), n);
}));

test("chatchat е в PROJECTS по подразбиране и case-ът вика deploy_chatchat", () => {
  const projects = /^PROJECTS="\$\{PROJECTS:-([^}]*)\}"/m.exec(script)?.[1] ?? "";
  assert.ok(projects.split(" ").includes("chatchat"), projects);
  assert.match(script, /^\s+chatchat\)\s+deploy_chatchat ;;$/m);
});
