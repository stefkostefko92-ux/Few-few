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
