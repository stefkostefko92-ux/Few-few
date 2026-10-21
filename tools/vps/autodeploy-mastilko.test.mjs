// autodeploy-mastilko.test.mjs — регресия за H1 от одита 25.09.2026: неохраненият билд на
// mastilko в deploy/autodeploy.sh прекратяваше ЦЕЛИЯ пробег под `set -euo pipefail` — следващите
// продукти оставаха неразгърнати, а кодът на mastilko — сменен и без node_modules.
//
// Тестът е ИЗПЪЛНИМ (по модела на autodeploy-korpora.test.mjs): реже реалните функции
// deploy_mastilko и mastilko_rollback от скрипта и ги пуска с bash под `set -euo pipefail` върху
// временна файлова система. npm/systemctl/sudo/rsync/install/chown са заглушки — проверяваме
// ПОТОКА (продължава ли пробегът, вдига ли се deploy_failed, връща ли се кодът), не самите инструменти.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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

// `fail` — коя стъпка да се провали: "build" | "ci" | "health" | "".
function run(fail) {
  const base = mkdtempSync(join(tmpdir(), "mastilko-"));
  try {
    const src = join(base, "release", "few-few");
    const live = join(base, "opt", "mastilko");
    const log = join(base, "log.txt");
    mkdirSync(join(src, "mastilko", "deploy"), { recursive: true });
    writeFileSync(join(src, "mastilko", "VERSION"), "new\n");
    writeFileSync(join(src, "mastilko", "deploy", "mastilko.service"), "[Unit]\n");
    mkdirSync(join(live, "node_modules"), { recursive: true });
    writeFileSync(join(live, "VERSION"), "old\n");
    writeFileSync(join(live, ".env"), "SECRET_STAYS=1\n");
    const cfg = [
      "set -euo pipefail",
      `SRC="${src}"`, `MASTILKO_DIR="${live}"`, 'MASTILKO_SERVICE="mastilko"',
      'MASTILKO_HEALTH_URL="http://127.0.0.1:0/"', 'TS="20260925-000000"', "deploy_failed=0",
      `L="${log}"`, `FAIL="${fail}"`,
      'log(){ :; }; ok(){ :; }; warn(){ echo "WARN $*" >> "$L"; }; die(){ echo "DIE $*" >> "$L"; exit 1; }',
      // Заглушки: само потокът, без системни ефекти.
      'id(){ return 0; }; useradd(){ return 0; }; chown(){ return 0; }; sleep(){ :; }',
      'install(){ return 0; }',
      'systemctl(){ echo "systemctl $*" >> "$L"; }',
      'sudo(){ shift 2; "$@"; }',
      'npm(){ case "$1 ${2:-}" in "ci "*) [ "$FAIL" = ci ] && return 1; rm -rf node_modules ;; "run build") [ "$FAIL" = build ] && return 1 ;; esac; return 0; }',
      'health(){ [ "$FAIL" != health ]; }',
      // rsync: последните два аргумента са източник/цел; --delete чисти целта без .env и data/.
      'rsync(){ local a=("$@"); local n=${#a[@]}; local s="${a[n-2]}" d="${a[n-1]}";',
      '  find "$d" -mindepth 1 -maxdepth 1 ! -name .env ! -name data ! -name node_modules ! -name .next -exec rm -rf {} +;',
      '  cp -a "$s". "$d"; }',
      fn("mastilko_rollback"), fn("deploy_mastilko"),
      // Следващият продукт в пробега: ако се стигне дотук, пробегът НЕ е убит.
      'deploy_mastilko',
      'echo "NEXT_PRODUCT_RAN failed=$deploy_failed" >> "$L"',
    ].join("\n");
    let code = 0;
    try { execFileSync("bash", ["-c", cfg], { encoding: "utf8", stdio: "pipe" }); }
    catch (e) { code = e.status; }
    return {
      code,
      log: readFileSync(log, "utf8"),
      version: readFileSync(join(live, "VERSION"), "utf8").trim(),
      env: readFileSync(join(live, ".env"), "utf8"),
    };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("провал на `npm run build`: пробегът продължава, deploy_failed=1, предишният код е върнат", () => {
  const r = run("build");
  assert.equal(r.code, 0, "set -e не бива да убива целия autodeploy");
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=1/);
  assert.match(r.log, /WARN mastilko: билдът се провали/);
  assert.equal(r.version, "old", "кодът на mastilko е върнат от бекъпа");
  assert.match(r.env, /SECRET_STAYS=1/, ".env оцелява");
  assert.match(r.log, /systemctl restart mastilko/, "услугата е вдигната отново със стария код");
});

test("провал на `npm ci`: същото — пробегът продължава и кодът е върнат", () => {
  const r = run("ci");
  assert.equal(r.code, 0);
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=1/);
  assert.equal(r.version, "old");
});

test("провал на health: откатът минава през mastilko_rollback и пробегът продължава", () => {
  const r = run("health");
  assert.equal(r.code, 0);
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=1/);
  assert.match(r.log, /WARN mastilko health провал/);
  assert.equal(r.version, "old");
});

test("успешен деплой: новият код е на мястото, deploy_failed=0", () => {
  const r = run("");
  assert.equal(r.code, 0);
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=0/);
  assert.equal(r.version, "new");
  assert.match(r.env, /SECRET_STAYS=1/);
});
