// autodeploy-erp.test.mjs — тайните на erp-ascensori и гейтът на изданието.
//
// Три дефекта, намерени при прегледа преди първия тест на машина:
//   1. .env се пренасяше САМО от `current`. Първото разгръщане пада по
//      конструкция (APP_URL е примерният), `current` не се мести — и
//      следващият пуск генерираше НОВИ тайни, падаше пак, в кръг.
//   2. Липсващ .env при СЪЩЕСТВУВАЩ том на базата водеше до нови тайни върху
//      стара база: нова парола = паднал гестионал, нов AUDIT_HMAC_KEY =
//      невалидни подписи в одита.
//   3. HEALTH_TOKEN се четеше с кавичките, които `setup-env.sh` пише — гейтът
//      на изданието не минаваше НИКОГА.
// Тестът е ИЗПЪЛНИМ: реже функциите от истинския скрипт и ги пуска с bash
// върху временна файлова система, с docker/curl/health като заместители.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = readFileSync(join(root, "deploy", "autodeploy.sh"), "utf8");

function fn(name) {
  const m = script.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `функцията ${name} съществува в autodeploy.sh`);
  return m[0];
}

function layout() {
  const base = mkdtempSync(join(tmpdir(), "autodeploy-erp-"));
  const releases = join(base, "releases");
  mkdirSync(releases);
  return { base, releases, current: join(base, "current"), shared: join(base, "shared") };
}

/** Ново издание с фалшив `setup-env.sh`, който пише .env и излиза с `codice`. */
function release(L, nome, codice = 0) {
  const d = join(L.releases, nome, "erp-ascensori");
  mkdirSync(join(d, "scripts"), { recursive: true });
  writeFileSync(
    join(d, "scripts", "setup-env.sh"),
    [
      "echo chiamato >> ../../setup-chiamato",
      `[ -f .env ] || printf 'SESSION_SECRET="s"\\nHEALTH_TOKEN="tok123"\\nAPP_URL=https://erp.azienda.it\\n' > .env`,
      `exit ${codice}`,
    ].join("\n"),
  );
  return join(L.releases, nome);
}

function run(L, src, { volume = false } = {}) {
  const cfg = [
    "set -euo pipefail",
    `SRC="${src}"`,
    `RELEASES_DIR="${L.releases}"`,
    `CURRENT_LINK="${L.current}"`,
    `SHARED_DIR="${L.shared}"`,
    'ERP_HEALTH_URL="http://127.0.0.1:3050/api/readyz"',
    "deploy_failed=0",
    "log() { :; }; ok() { :; }; warn() { echo \"WARN $*\"; }",
    "health() { return 0; }",
    // docker: том по избор; compose ps — нищо не върви (пръв деплой); up — ок.
    `docker() { if [ "$1 $2" = "volume inspect" ]; then return ${volume ? 0 : 1}; fi; return 0; }`,
    // curl: записва конфигурацията от stdin — там стои токенът.
    `curl() { cat > "${L.base}/curl-config"; echo '{"pronto":true,"rilascio":true}'; }`,
    fn("carry_env"),
    fn("deploy_erp_ascensori"),
    "deploy_erp_ascensori",
    'echo "FAILED=$deploy_failed"',
  ].join("\n");
  return execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
}

const mode = (p) => (statSync(p).mode & 0o777).toString(8);
const chiamate = (L) =>
  existsSync(join(L.releases, "setup-chiamato"))
    ? readFileSync(join(L.releases, "setup-chiamato"), "utf8").trim().split("\n").length
    : 0;

test("пръв деплой пада на APP_URL, но .env остава на СТАБИЛНИЯ път; вторият не генерира нови тайни", () => {
  const L = layout();
  try {
    const r1 = release(L, "r1", 1);
    const out1 = run(L, r1);
    assert.match(out1, /FAILED=1/);
    const shared = join(L.shared, "erp-ascensori", ".env");
    assert.ok(existsSync(shared), "генерираният .env е записан в споделения път");
    assert.equal(mode(shared), "600");
    assert.match(out1, new RegExp(`APP_URL в ${shared.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`));

    // Човекът редактира СПОДЕЛЕНИЯ файл; `current` още не съществува.
    writeFileSync(shared, 'SESSION_SECRET="s"\nHEALTH_TOKEN="tok123"\nAPP_URL=https://erp.cliente.it\n');
    const r2 = release(L, "r2", 0);
    const out2 = run(L, r2);
    assert.match(out2, /FAILED=0/);
    assert.equal(chiamate(L), 1, "setup-env.sh не се вика втори път");
    assert.match(readFileSync(join(r2, "erp-ascensori", ".env"), "utf8"), /erp\.cliente\.it/);
  } finally {
    rmSync(L.base, { recursive: true, force: true });
  }
});

test("том на базата без .env → отказ, БЕЗ нови тайни", () => {
  const L = layout();
  try {
    const r = release(L, "r1", 0);
    const out = run(L, r, { volume: true });
    assert.match(out, /FAILED=1/);
    assert.match(out, /НЕ генерирам нови тайни/);
    assert.equal(chiamate(L), 0);
    assert.ok(!existsSync(join(r, "erp-ascensori", ".env")));
    assert.ok(!existsSync(join(L.shared, "erp-ascensori", ".env")));
  } finally {
    rmSync(L.base, { recursive: true, force: true });
  }
});

test("HEALTH_TOKEN в кавички стига до гейта БЕЗ кавичките", () => {
  const L = layout();
  try {
    mkdirSync(join(L.shared, "erp-ascensori"), { recursive: true });
    writeFileSync(join(L.shared, "erp-ascensori", ".env"), 'HEALTH_TOKEN="tok123"\nAPP_URL=https://erp.cliente.it\n');
    const r = release(L, "r1", 0);
    const out = run(L, r);
    assert.match(out, /FAILED=0/);
    const conf = readFileSync(join(L.base, "curl-config"), "utf8");
    assert.equal(conf.trim(), 'header = "x-health-token: tok123"');
  } finally {
    rmSync(L.base, { recursive: true, force: true });
  }
});
