// migrate-backup.test.mjs — архивът за преместване на сървър (tools/vps/migrate-backup.sh).
//
// В CI (не-root) се проверяват синтаксисът, линтерът и отказът без root. Като root
// (локално, на сървър) тече и реален пробег върху пясъчник: SQLite в WAL режим на
// чужд собственик + node_modules + стар release → шифрован архив → дешифриране и
// сверка какво е вътре. Docker и Postgres частите са проверени на живо с двойник на
// docker CLI и истински клъстер — тук не, защото CI няма нито root, нито демон.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync, symlinkSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lintShell } from "./deploy-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "migrate-backup.sh");
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;

test("синтаксис: bash -n", () => {
  const r = spawnSync("bash", ["-n", script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("deploy-check: без HIGH находки", () => {
  const f = lintShell(readFileSync(script, "utf8"), "migrate-backup.sh");
  assert.deepEqual(f.filter((x) => x.sev === "HIGH"), []);
});

test("отказва без root, преди да пипне каквото и да е", { skip: isRoot && "върви като root" }, () => {
  const out = mkdtempSync(join(tmpdir(), "mb-"));
  const r = spawnSync("bash", [script], { encoding: "utf8", env: { ...process.env, PLAN: "1", OUT_DIR: join(out, "o") } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /root/);
  assert.equal(existsSync(join(out, "o")), false);
  rmSync(out, { recursive: true, force: true });
});

test("OUT_DIR вътре в архивиран път се отказва", { skip: !isRoot && "иска root" }, () => {
  const r = spawnSync("bash", [script], { encoding: "utf8", env: { ...process.env, PLAN: "1", ROOTS: "/opt", OUT_DIR: "/opt/x" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /архивът би влязъл сам в себе си/);
});

test("горещ архив в пясъчник: съдържание, изключения, нула нешифровани остатъци", {
  skip: (!isRoot && "иска root") || ((!has("gpg") || !has("python3")) && "липсва gpg/python3"),
}, () => {
  const t = mkdtempSync(join(tmpdir(), "mb-"));
  const sbx = join(t, "sbx");
  const data = join(sbx, "opt", "app", "data");
  mkdirSync(data, { recursive: true });
  mkdirSync(join(sbx, "opt", "app", "node_modules", "x"), { recursive: true });
  writeFileSync(join(sbx, "opt", "app", "node_modules", "x", "f"), "big");
  const db = join(data, "app.db");
  const py = spawnSync("python3", ["-c",
    "import sqlite3,sys\nc=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA journal_mode=WAL');c.execute('create table t(x)');" +
    "c.executemany('insert into t values(?)',[(i,) for i in range(500)]);c.commit();c.close()", db]);
  assert.equal(py.status, 0, String(py.stderr));
  spawnSync("chown", ["-R", "nobody", data]);
  const rel = join(sbx, "opt", "few-few", "releases");
  for (const r of ["20260101T000000Z", "20260201T000000Z"]) {
    mkdirSync(join(rel, r, "p"), { recursive: true });
    writeFileSync(join(rel, r, "p", ".env"), `K_${r}=1\n`);
  }
  symlinkSync(join(rel, "20260201T000000Z"), join(sbx, "opt", "few-few", "current"));
  const env = {
    ...process.env, ROOTS: join(sbx, "opt"), RELEASES_DIR: rel, CURRENT_LINK: join(sbx, "opt", "few-few", "current"),
    OUT_DIR: join(t, "out"), PASS_FILE: join(t, "pass"),
  };
  const run = spawnSync("bash", [script], { encoding: "utf8", env });
  assert.equal(run.status, 0, run.stdout + run.stderr);

  const outFiles = readdirSync(join(t, "out"));
  assert.deepEqual(outFiles.filter((f) => f.startsWith(".work-")), [], "STAGE с нешифровани дъмпове остана на диска");
  assert.equal(statSync(join(t, "pass")).mode & 0o777, 0o600);
  // Отварянето от root не бива да остави -wal/-shm, които услугата не може да пише.
  for (const f of readdirSync(data)) assert.equal(statSync(join(data, f)).uid, statSync(db).uid, f);

  const arch = join(t, "out", outFiles.find((f) => f.endsWith(".gpg")));
  const gh = mkdtempSync("/tmp/.mbt-");
  const decomp = arch.endsWith(".tar.zst.gpg") ? "zstd -dcq" : "gzip -dc";
  const list = spawnSync("sh", ["-c",
    `gpg --homedir "$1" --batch --quiet --pinentry-mode loopback --passphrase-file "$2" -d "$3" | ${decomp} | tar -tf -`,
    "sh", gh, join(t, "pass"), arch], { encoding: "utf8" }).stdout;
  rmSync(gh, { recursive: true, force: true });
  const p = sbx.slice(1);
  assert.ok(list.includes(`${p}/opt/app/data/app.db`), "суровата база липсва");
  assert.ok(list.includes(`migrate/sqlite${db}`), "копието през backup API липсва");
  assert.ok(list.includes("migrate/inventory.txt"));
  assert.ok(!list.includes("node_modules"), "node_modules влезе в архива");
  const lines = list.split("\n");
  assert.ok(!lines.some((l) => l.startsWith(`${p}/opt/few-few/releases/20260101T000000Z/`)), "стар release влезе цял");
  assert.ok(lines.some((l) => l.startsWith(`${p}/opt/few-few/releases/20260201T000000Z/`)), "текущият release липсва");
  assert.ok(list.includes(`migrate/secrets${rel}/20260101T000000Z/p/.env`), ".env от стария release липсва");
  rmSync(t, { recursive: true, force: true });
});

// Преглед на PR #312 (Кодаджията — High, CWE-59/367): root правеше `chown "$own" "$f-wal"` след
// `[ -e ]` — и двете следват symlink. Нападател с папка под /var/www подменя x.db-wal със symlink
// към /run/docker.sock и нощната задача му дава собствеността. Тест: python3 е заглушен и създава
// -wal като symlink към файл на root; след backup_sqlite целта остава на root.
test("backup_sqlite: -wal/-shm като symlink НЕ прехвърля собствеността на целта", { skip: !isRoot && "иска root (chown)" }, () => {
  const src = readFileSync(script, "utf8");
  const fn = src.match(/^backup_sqlite\(\)\{\n[\s\S]*?^\}/m)?.[0];
  assert.ok(fn, "backup_sqlite съществува");
  const base = mkdtempSync(join(tmpdir(), "mbsq-"));
  try {
    const app = join(base, "www"), bin = join(base, "bin"), stage = join(base, "stage");
    for (const d of [app, bin, stage]) mkdirSync(d, { recursive: true });
    const db = join(app, "x.db");
    writeFileSync(db, "SQLite format 3\0");
    const target = join(base, "docker.sock");
    writeFileSync(target, "");
    spawnSync("chown", ["65534:65534", db, app]);
    // „python3“: копието минава, а междувременно -wal и -shm се появяват като symlink към целта.
    writeFileSync(join(bin, "python3"), `#!/bin/sh\nln -s "${target}" "$4-wal"; ln -s "${target}" "$4-shm"; : > "$5"; exit 0\n`, { mode: 0o755 });
    const cfg = ["set -uo pipefail", `export PATH="${bin}:$PATH"`, `STAGE="${stage}"`, `ERR="${join(base, "err")}"`,
      "SQLITE_PY=x", "SQLITES=()", "fail(){ :; }", "errline(){ :; }", fn, `backup_sqlite "${db}"`].join("\n");
    const r = spawnSync("bash", ["-c", cfg], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(statSync(target).uid, 0, "целта на symlink-а остава на root");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

// Преглед на PR #312 (Кодаджията — Medium): томът на работеща MongoDB се пропускаше като „жива база,
// дъмпът е копието“, а дъмп за Mongo няма → данните липсваха от нощния бекъп при изход 0. А
// mongod.service на хоста: /var/lib/mongodb не е в ROOTS → нито в архива, нито предупреждение.
test("MongoDB: томът не се пропуска като „дъмпнат“, а хостовият mongod влиза в ROOTS", () => {
  const src = readFileSync(script, "utf8");
  const live = src.match(/case "\$\{CKIND\[\$c\]\}" in ([a-z|]+)\) if \[ "\$\{CRUN\[\$c\]\}" = true \]; then LIVE_DB_SRC/);
  assert.ok(live, "редът с LIVE_DB_SRC съществува");
  assert.doesNotMatch(live[1], /mongo/, "Mongo няма логически дъмп — суровият том трябва да влезе");
  assert.match(src, /mongod\.service "\*\) ROOTS="\$ROOTS \/var\/lib\/mongodb"/, "хостовият mongod влиза в архива");
});

// Повторен преглед на PR #312 (Кодаджията, VPS-аджията — Medium):
test("backup_sqlite: база, изчезнала по време на обхода, не убива скрипта под set -e", () => {
  const src = readFileSync(script, "utf8");
  const fn = src.match(/^backup_sqlite\(\)\{\n[\s\S]*?^\}/m)?.[0];
  assert.ok(fn);
  const base = mkdtempSync(join(tmpdir(), "mbgone-"));
  try {
    const bin = join(base, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "python3"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const cfg = ["set -euo pipefail", `export PATH="${bin}:$PATH"`, `STAGE="${join(base, "stage")}"`, `ERR="${join(base, "err")}"`,
      "SQLITE_PY=x", "SQLITES=()", "FAILS=()", 'fail(){ FAILS+=("$*"); }', "errline(){ :; }", fn,
      `backup_sqlite "${join(base, "nyama.db")}"`, 'echo "FAILS=${#FAILS[@]}"'].join("\n");
    const r = spawnSync("bash", ["-c", cfg], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /FAILS=1/, "провалът се записва, скриптът продължава");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("Postgres без отговор, но с том с данни, е ПРОВАЛ (не „помощен“) и суровият му том влиза", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /CKIND\[\$c\]=pgdown/, "жива база без pg_isready се маркира отделно");
  assert.match(src, /pgdown\) fail "Postgres \$c/, "и дава fail, не тишина");
  assert.doesNotMatch(src.match(/case "\$\{CKIND\[\$c\]\}" in ([a-z|]+)\) if/)[1], /pgdown/, "томът ѝ не се пропуска");
});

test("нощните дъмпове и пробното възстановяване проверяват свободното място", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /MODE" = dumps \] && \[ "\$FREE" -lt "\$MIN_FREE_KB" \]/, "dumps: минимум свободно място");
  const off = readFileSync(join(here, "offsite-backup.sh"), "utf8");
  assert.match(off, /df -Pk "\$VERIFY_TMP"/, "verify сверява свободното място преди restore");
});
