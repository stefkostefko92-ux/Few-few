// autodeploy-env.test.mjs — тайните на Supreme оцеляват местене на `current` и
// чистене на releases (реален инцидент, 17.09.2026).
//
// Дотогава autodeploy.sh пренасяше четирите .env файла САМО от `current`. Но
// `current` се мести при всеки успешен деплой на КОЙТО И ДА Е продукт от същия
// архив (PROJECTS="adblock") → сочи release без Supreme .env → следващият Supreme
// деплой падаше на „[1/4] Missing: backend/.env …" СЛЕД pg_dump, с подкана
// „cp .env.example .env" — грешният съвет на продукционен сървър. Тестът тук е
// ИЗПЪЛНИМ: реже двете функции от истинския скрипт и ги пуска с bash върху
// временна файлова система. Мутация (връщане към „само current") → пада.
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

// Обвивка: конфигурацията на теста + двете функции + командата.
function run(layout, body) {
  const cfg = [
    "set -euo pipefail",
    `RELEASES_DIR="${layout.releases}"`,
    `CURRENT_LINK="${layout.current}"`,
    `SUPREME_ENV_DIR="${layout.shared}"`,
    'SUPREME_ENV_FILES=".env backend/.env bot/.env frontend/.env"',
    fn("supreme_env_source"),
    fn("supreme_persist_env"),
    body,
  ].join("\n");
  return execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
}

const FILES = [".env", "backend/.env", "bot/.env", "frontend/.env"];
function seed(dir, files = FILES, stamp = "x") {
  for (const f of files) {
    mkdirSync(join(dir, dirname(f)), { recursive: true });
    writeFileSync(join(dir, f), `KEY=${stamp}-${f}\n`);
  }
}
function layout() {
  const base = mkdtempSync(join(tmpdir(), "autodeploy-env-"));
  const releases = join(base, "releases");
  mkdirSync(releases);
  return { base, releases, current: join(base, "current"), shared: join(base, "shared", "SupremeDiscordBot") };
}
const mode = (p) => (statSync(p).mode & 0o777).toString(8);

test("current без Supreme .env (деплой на друг продукт) → източникът е най-новият release, който ги има", () => {
  const L = layout();
  try {
    // current сочи release от друг продукт — без SupremeDiscordBot/*.env
    mkdirSync(join(L.releases, "20260916-185118", "Few-few-main", "adblock"), { recursive: true });
    execFileSync("ln", ["-sfn", join(L.releases, "20260916-185118", "Few-few-main"), L.current]);
    seed(join(L.releases, "20260812-191314", "Few-few-main", "SupremeDiscordBot"), FILES, "old");
    seed(join(L.releases, "20260912-101010", "Few-few-main", "SupremeDiscordBot"), FILES, "new");
    const out = run(L, "supreme_env_source").trim();
    assert.equal(out, join(L.releases, "20260912-101010", "Few-few-main", "SupremeDiscordBot"));
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("current ги има → печели над shared (там редактира човекът)", () => {
  const L = layout();
  try {
    seed(join(L.releases, "20260916-185118", "Few-few-main", "SupremeDiscordBot"), FILES, "cur");
    execFileSync("ln", ["-sfn", join(L.releases, "20260916-185118", "Few-few-main"), L.current]);
    seed(L.shared, FILES, "shared");
    const out = run(L, "supreme_env_source").trim();
    assert.equal(out, join(L.current, "SupremeDiscordBot"));
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("current без тях, shared ги има → shared печели над стар release", () => {
  const L = layout();
  try {
    mkdirSync(join(L.releases, "20260916-185118", "Few-few-main", "adblock"), { recursive: true });
    execFileSync("ln", ["-sfn", join(L.releases, "20260916-185118", "Few-few-main"), L.current]);
    seed(join(L.releases, "20260812-191314", "Few-few-main", "SupremeDiscordBot"), FILES, "old");
    seed(L.shared, FILES, "shared");
    assert.equal(run(L, "supreme_env_source").trim(), L.shared);
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("никъде няма backend/.env → код 1 и празен изход (fail-closed, не .env.example)", () => {
  const L = layout();
  try {
    mkdirSync(join(L.releases, "20260916-185118", "Few-few-main", "adblock"), { recursive: true });
    execFileSync("ln", ["-sfn", join(L.releases, "20260916-185118", "Few-few-main"), L.current]);
    // само корен .env, без backend/.env — не се брои за „има ги"
    seed(join(L.releases, "20260812-191314", "Few-few-main", "SupremeDiscordBot"), [".env"], "half");
    const out = run(L, 'if supreme_env_source; then echo FOUND; else echo "rc=$?"; fi').trim();
    assert.equal(out, "rc=1");
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("persist: огледало 700/600, идемпотентно, липсващ файл НЕ трие копието", () => {
  const L = layout();
  try {
    const src = join(L.base, "src");
    seed(src, FILES, "v1");
    run(L, `supreme_persist_env "${src}"`);
    for (const f of FILES) {
      assert.ok(existsSync(join(L.shared, f)), `${f} е огледан`);
      assert.equal(mode(join(L.shared, f)), "600", `${f} е 600`);
      assert.equal(readFileSync(join(L.shared, f), "utf8"), `KEY=v1-${f}\n`);
    }
    assert.equal(mode(L.shared), "700");
    // втори пробег: backend променен, frontend изчезнал → backend се обновява, frontend остава
    writeFileSync(join(src, "backend", ".env"), "KEY=v2-backend/.env\n");
    rmSync(join(src, "frontend", ".env"));
    run(L, `supreme_persist_env "${src}"`);
    assert.equal(readFileSync(join(L.shared, "backend", ".env"), "utf8"), "KEY=v2-backend/.env\n");
    assert.equal(readFileSync(join(L.shared, "frontend", ".env"), "utf8"), "KEY=v1-frontend/.env\n");
    // източник без backend/.env → нищо не се пипа, код 0 (никога не проваля друг продукт)
    const empty = join(L.base, "empty"); mkdirSync(empty);
    assert.equal(run(L, `supreme_persist_env "${empty}"; echo "rc=$?"`).trim(), "rc=0");
    assert.equal(readFileSync(join(L.shared, "backend", ".env"), "utf8"), "KEY=v2-backend/.env\n");
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("persist не печата съдържание на тайни", () => {
  const L = layout();
  try {
    const src = join(L.base, "src");
    seed(src, FILES, "SECRETVALUE");
    const out = run(L, `supreme_persist_env "${src}" 2>&1`);
    assert.ok(!/SECRETVALUE/.test(out));
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

// ── Статични котви в deploy_supreme и в главния поток ────────────────────────
test("deploy_supreme търси източника, спира РАНО при липса и огледава в shared", () => {
  const body = script.slice(script.indexOf("deploy_supreme() {"), script.indexOf("supreme_rollback_hint() {"));
  assert.match(body, /src_env="\$\(supreme_env_source \|\| true\)"/, "източникът се търси, не се предполага");
  assert.match(body, /for f in \$SUPREME_ENV_FILES; do \[ -f "\$d\/\$f" \] \|\| missing=/, "проверка за липсващи файлове");
  const missingAt = body.indexOf('deploy_failed=1; return');
  const dumpAt = body.indexOf("supreme_pre_deploy_dump");
  assert.ok(missingAt > 0 && missingAt < dumpAt, "липсващ .env спира ПРЕДИ pg_dump");
  assert.match(body, /supreme_persist_env "\$d"/, "каноничното копие се огледава преди deploy.sh");
  // Коментарът може да го цитира като грешния съвет; ИЗХОДЪТ (warn/echo/ok/log) — никога.
  assert.ok(!/^\s*(warn|echo|ok|log)\b.*cp \.env\.example/m.test(body), "никога не съветва .env.example на продукция");
});

test("преди цикъла по проекти тайните от current се огледават (друг продукт може да премести current)", () => {
  const loopAt = script.indexOf("for p in $PROJECTS; do");
  const persistAt = script.indexOf('supreme_persist_env "$CURRENT_LINK/SupremeDiscordBot" || true');
  assert.ok(persistAt > 0 && persistAt < loopAt);
});
