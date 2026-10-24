// autodeploy-prune.test.mjs — чистенето на стари releases не трие код изпод жив контейнер (2026-10-11).
//
// Инцидент: zabobovdol беше вдигнат от release на 18.09; следващите деплои пускаха само други
// продукти и prune_releases изтри папката. При рестарт nginx (./nginx/zabobovdol.conf) и backup
// (./scripts) не намериха монтираните си файлове → 502 за целия сайт. А единственото копие на
// zabobovdol/.env беше в същата папка. Тестът е ИЗПЪЛНИМ: реже реалните функции от скрипта и ги
// пуска с bash върху временна файлова система; docker е заглушен.
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

// Шест releases (най-старият първи); KEEP_RELEASES=2 → четирите най-стари са кандидати за триене.
function layout() {
  const base = mkdtempSync(join(tmpdir(), "prune-"));
  const L = { base, releases: join(base, "releases"), shared: join(base, "shared"), bin: join(base, "bin"), log: join(base, "log.txt") };
  for (const p of [L.releases, L.shared, L.bin]) mkdirSync(p, { recursive: true });
  L.rel = ["20260918-130341", "20260920-100000", "20260925-100000", "20261001-100000", "20261010-100000", "20261011-101124"].map((ts, i) => {
    const r = join(L.releases, ts, "few-few");
    mkdirSync(join(r, "zabobovdol", "nginx"), { recursive: true });
    writeFileSync(join(r, "zabobovdol", "nginx", "zabobovdol.conf"), "server {}\n");
    // Подреждане по mtime, както в реалния скрипт (ls -t).
    execFileSync("touch", ["-d", `2026-10-0${i + 1} 10:00`, join(L.releases, ts)]);
    return join(L.releases, ts);
  });
  L.current = join(base, "current");
  execFileSync("ln", ["-sfn", join(L.rel[5], "few-few"), L.current]);
  return L;
}
// docker заглушка: `ps -aq` дава id-та; `inspect` печата зададените монтирани пътища.
function dockerStub(L, { mounts = [], fail = false } = {}) {
  const body = fail
    ? "#!/bin/sh\nexit 1\n"
    : `#!/bin/sh\ncase "$1" in\n  ps) echo abc123 ;;\n  inspect) printf '%s\\n' ${mounts.map((m) => JSON.stringify(m)).join(" ")} ;;\nesac\n`;
  writeFileSync(join(L.bin, "docker"), body, { mode: 0o755 });
}
function run(L) {
  const cfg = [
    "set -euo pipefail",
    `export PATH="${L.bin}:$PATH"`,
    `RELEASES_DIR="${L.releases}"`, `CURRENT_LINK="${L.current}"`, `SHARED_DIR="${L.shared}"`,
    `SRC="${join(L.rel[5], "few-few")}"`, "KEEP_RELEASES=2", `KORPORA_LAST_GOOD="${join(L.base, "nope")}"`,
    `log(){ echo "LOG $*" >> "${L.log}"; }; ok(){ :; }; warn(){ echo "WARN $*" >> "${L.log}"; }`,
    ...["release_mount_sources", "rescue_release_env", "prune_releases"].map(fn),
    "prune_releases",
  ].join("\n");
  execFileSync("bash", ["-c", cfg], { encoding: "utf8" });
  return existsSync(L.log) ? readFileSync(L.log, "utf8") : "";
}

test("ИНЦИДЕНТЪТ: release, от който контейнер монтира файл, НЕ се трие, дори да е най-старият", () => {
  const L = layout();
  try {
    dockerStub(L, { mounts: [join(L.rel[0], "few-few", "zabobovdol", "nginx", "zabobovdol.conf"), "/var/lib/docker/volumes/x/_data"] });
    const log = run(L);
    assert.ok(existsSync(L.rel[0]), "release-ът на работещия стек остава");
    assert.match(log, /Пазя 20260918-130341 — контейнер монтира файлове от него/);
    for (const i of [1, 2, 3]) assert.ok(!existsSync(L.rel[i]), `немонтираният стар release ${i} се трие`);
    for (const i of [4, 5]) assert.ok(existsSync(L.rel[i]), `последните KEEP_RELEASES остават (${i})`);
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("FAIL CLOSED: Docker не отговаря → не се трие нищо", () => {
  const L = layout();
  try {
    dockerStub(L, { fail: true });
    const log = run(L);
    for (const r of L.rel) assert.ok(existsSync(r), `${r} остава`);
    assert.match(log, /Docker не отговаря — не трия стари releases/);
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test("без монтирани пътища: обичайното чистене работи (пазят се последните + current)", () => {
  const L = layout();
  try {
    dockerStub(L, { mounts: [] });
    run(L);
    for (const i of [0, 1, 2, 3]) assert.ok(!existsSync(L.rel[i]), `стар release ${i} се трие`);
    for (const i of [4, 5]) assert.ok(existsSync(L.rel[i]));
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test(".env, който живее САМО в изтривани releases → спасява се НАЙ-НОВОТО копие в shared (600)", () => {
  const L = layout();
  try {
    dockerStub(L, { mounts: [] });
    writeFileSync(join(L.rel[0], "few-few", "zabobovdol", ".env"), "POSTGRES_PASSWORD=STARO\n");
    writeFileSync(join(L.rel[2], "few-few", "zabobovdol", ".env"), "POSTGRES_PASSWORD=NOVO\n");
    const log = run(L);
    const saved = join(L.shared, "zabobovdol", ".env");
    assert.equal(readFileSync(saved, "utf8"), "POSTGRES_PASSWORD=NOVO\n", "най-новото копие, не застарялото");
    assert.equal(statSync(saved).mode & 0o777, 0o600);
    assert.match(log, /Спасих zabobovdol\/\.env/);
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});

test(".env НЕ се презаписва, ако shared вече го има; и не се спасява, ако запазен release го има", () => {
  const L = layout();
  try {
    dockerStub(L, { mounts: [] });
    mkdirSync(join(L.shared, "zabobovdol"), { recursive: true });
    writeFileSync(join(L.shared, "zabobovdol", ".env"), "POSTGRES_PASSWORD=ISTINSKA\n");
    writeFileSync(join(L.rel[1], "few-few", "zabobovdol", ".env"), "POSTGRES_PASSWORD=STARO\n");
    writeFileSync(join(L.rel[1], "few-few", "zabobovdol", ".keep"), "");
    mkdirSync(join(L.rel[0], "few-few", "eternaltouch"), { recursive: true });
    writeFileSync(join(L.rel[0], "few-few", "eternaltouch", ".env"), "X=1\n");
    mkdirSync(join(L.rel[5], "few-few", "eternaltouch"), { recursive: true });
    writeFileSync(join(L.rel[5], "few-few", "eternaltouch", ".env"), "X=2\n");
    run(L);
    assert.equal(readFileSync(join(L.shared, "zabobovdol", ".env"), "utf8"), "POSTGRES_PASSWORD=ISTINSKA\n");
    assert.ok(!existsSync(join(L.shared, "eternaltouch", ".env")), "запазеният release още го има — carry_env ще го намери");
  } finally { rmSync(L.base, { recursive: true, force: true }); }
});
