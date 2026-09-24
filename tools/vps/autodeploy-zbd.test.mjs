// autodeploy-zbd.test.mjs — деплоят на zabobovdol: тайни, сонда, откат, IndexNow (2026-09-24).
//
// Жива проверка на VPS-аджията намери три дупки в deploy_zabobovdol: .env само от `current` (липсва ли,
// setup-env.sh генерира НОВ POSTGRES_PASSWORD за съществуваща база → продукцията пада), сонда на „/“
// без маркер (200 от страница без база минава) и никакъв откат. Тестът е ИЗПЪЛНИМ: реже реалните
// функции от скрипта и ги пуска с bash върху временна файлова система; docker/сондата/setup-env са
// заглушени и пишат в дневник какво са извикани.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs";
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

function layout({ healthRc = 0 } = {}) {
  const base = mkdtempSync(join(tmpdir(), "zbd-"));
  const L = { base, releases: join(base, "releases"), current: join(base, "current"), shared: join(base, "shared"),
    src: join(base, "releases", "new", "few-few"), bin: join(base, "bin"), log: join(base, "log.txt"), healthRc };
  for (const p of [L.releases, L.shared, L.bin]) mkdirSync(p, { recursive: true });
  // Новият release: zabobovdol с заглушени скриптове.
  mkdirSync(join(L.src, "zabobovdol", "scripts"), { recursive: true });
  writeFileSync(join(L.src, "zabobovdol", "scripts", "deploy.sh"), `echo "deploy.sh" >> "${L.log}"\n`);
  writeFileSync(join(L.src, "zabobovdol", "scripts", "setup-env.sh"), `echo "setup-env.sh" >> "${L.log}"; echo "POSTGRES_PASSWORD=NEW" > .env\n`);
  mkdirSync(join(L.src, "tools", "seo"), { recursive: true });
  writeFileSync(join(L.src, "tools", "seo", "indexnow.mjs"), `require("fs").appendFileSync(${JSON.stringify(L.log)}, "indexnow " + process.argv.slice(2).join(" ") + "\\n");\n`.replace("require(\"fs\")", "(await import('node:fs'))"));
  // docker заглушка: пише cwd + аргументите.
  writeFileSync(join(L.bin, "docker"), `#!/bin/sh\n[ "$1" = compose ] && [ "$2" = version ] && exit 0\necho "docker $* @ $(pwd)" >> "${L.log}"\n`, { mode: 0o755 });
  return L;
}
function seedPrev(L, env = "POSTGRES_PASSWORD=OLD\nHTTP_PORT=8081\n") {
  const prevRoot = join(L.releases, "old", "few-few");
  mkdirSync(join(prevRoot, "zabobovdol"), { recursive: true });
  if (env !== null) writeFileSync(join(prevRoot, "zabobovdol", ".env"), env);
  execFileSync("ln", ["-sfn", prevRoot, L.current]);
  return prevRoot;
}
function run(L, body) {
  const cfg = [
    "set -euo pipefail",
    `export PATH="${L.bin}:$PATH"`,
    `RELEASES_DIR="${L.releases}"`, `CURRENT_LINK="${L.current}"`, `SRC="${L.src}"`,
    `ZBD_ENV="${join(L.shared, "zabobovdol", ".env")}"`, `ZBD_BACKUPS="${join(L.shared, "zabobovdol", "backups")}"`,
    'ZBD_HEALTH_URL_SET=""', 'ZBD_HEALTH_URL="http://127.0.0.1:80/api/health"', `ZBD_HEALTH_EXPECT='"ok":true'`,
    'ZBD_SITE="https://zabobovdol.carbonstealth.eu"', 'ZBD_INDEXNOW=1', 'FORCE_SEED=0', 'deploy_failed=0',
    'log(){ :; }; ok(){ :; }; warn(){ echo "WARN $*" >> "' + L.log + '"; }',
    `health(){ echo "health $1 | $3" >> "${L.log}"; return ${L.healthRc}; }`,
    ...["zbd_env_source", "zbd_has_data", "zbd_persist_env", "zbd_health_url", "zbd_rollback", "zbd_ping_indexnow", "deploy_zabobovdol"].map(fn),
    body,
  ].join("\n");
  execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
  return existsSync(L.log) ? readFileSync(L.log, "utf8") : "";
}

test("успешен деплой: .env от current → стабилен дом (600); сонда на /api/health с маркер; IndexNow", () => {
  const L = layout();
  try {
    seedPrev(L);
    const log = run(L, 'deploy_zabobovdol; echo "failed=$deploy_failed" >> "' + L.log + '"');
    assert.match(log, /health http:\/\/127\.0\.0\.1:8081\/api\/health \| "ok":true/, "портът от .env, пътят /api/health, маркерът");
    assert.match(log, /indexnow https:\/\/zabobovdol\.carbonstealth\.eu --key-location https:\/\/zabobovdol\.carbonstealth\.eu\/indexnow-key\.txt/);
    assert.match(log, /failed=0/);
    const home = join(L.shared, "zabobovdol", ".env");
    assert.equal(readFileSync(home, "utf8"), "POSTGRES_PASSWORD=OLD\nHTTP_PORT=8081\n");
    assert.equal((statSync(home).mode & 0o777).toString(8), "600");
    assert.doesNotMatch(log, /setup-env/);
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("current без zabobovdol/.env, но стабилният дом го има → ползва дома, НЕ генерира нови тайни", () => {
  const L = layout();
  try {
    seedPrev(L, null);
    mkdirSync(join(L.shared, "zabobovdol"), { recursive: true });
    writeFileSync(join(L.shared, "zabobovdol", ".env"), "POSTGRES_PASSWORD=HOME\n");
    const log = run(L, "deploy_zabobovdol");
    assert.doesNotMatch(log, /setup-env/);
    assert.equal(readFileSync(join(L.src, "zabobovdol", ".env"), "utf8"), "POSTGRES_PASSWORD=HOME\n");
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("FAIL CLOSED: .env липсва навсякъде, а има дъмп от предишна инсталация → спира, без setup-env и без deploy", () => {
  const L = layout();
  try {
    seedPrev(L, null);
    mkdirSync(join(L.shared, "zabobovdol", "backups"), { recursive: true });
    writeFileSync(join(L.shared, "zabobovdol", "backups", "zbd-20260901.dump"), "x");
    const log = run(L, 'deploy_zabobovdol; echo "failed=$deploy_failed" >> "' + L.log + '"');
    assert.doesNotMatch(log, /setup-env|deploy\.sh/, "нито нови тайни, нито деплой");
    assert.match(log, /failed=1/);
    assert.match(log, /НЕ генерирам нови тайни/);
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("първа инсталация (нищо: без .env и без данни) → setup-env.sh е позволен", () => {
  const L = layout();
  try {
    const log = run(L, "deploy_zabobovdol");
    assert.match(log, /setup-env\.sh/);
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("провалена сонда → откат: предишният код се вдига със compose в неговата папка; без IndexNow", () => {
  const L = layout({ healthRc: 1 });
  try {
    const prev = seedPrev(L);
    const log = run(L, 'deploy_zabobovdol; echo "failed=$deploy_failed" >> "' + L.log + '"');
    assert.ok(log.includes(`docker compose up -d --build @ ${join(prev, "zabobovdol")}`), log);
    assert.doesNotMatch(log, /indexnow/);
    assert.match(log, /failed=1/);
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});
