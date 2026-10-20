// offsite-backup.test.mjs — нощният бекъп извън машината (tools/vps/offsite-backup.sh).
//
// В CI (не-root) се проверяват синтаксисът, линтерът, отказът без root и systemd
// единиците. Като root тече и разборът на конфига, а при наличен restic — целият
// път в пясъчник: init → backup → verify срещу локално хранилище, повредена SQLite
// в снимката → verify пада, и пингът на мъртвеца-ключ (успех / `…/fail` ПРЕДИ
// заявката) към локален приемник. Docker и Postgres частите на дъмповете са тези
// на migrate-backup.sh и са проверени на живо там.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readdirSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lintShell } from "./deploy-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "offsite-backup.sh");
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;

// Асинхронно: приемникът на пинга живее в същия процес и spawnSync би го задушил.
function run(args, env) {
  return new Promise((resolve) => {
    const p = spawn("bash", [script, ...args], { env });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (status) => resolve({ status, out }));
  });
}

function sandbox() {
  const t = mkdtempSync(join(tmpdir(), "ob-"));
  const pass = join(t, "restic.pass");
  writeFileSync(pass, "test-only-restic-key-0123456789\n", { mode: 0o600 });
  const envFile = join(t, "offsite.env");
  const writeEnv = (lines) => writeFileSync(envFile, lines.join("\n") + "\n", { mode: 0o600 });
  writeEnv([`RESTIC_REPOSITORY=${join(t, "repo")}`, `RESTIC_PASSWORD_FILE=${pass}`]);
  const env = {
    ...process.env, ENV_FILE: envFile, DUMP_DIR: join(t, "dumps"), RESTIC_CACHE_DIR: join(t, "cache"),
    LOCK_FILE: join(t, "lock"), VERIFY_TMP: t, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1",
  };
  return { t, envFile, pass, writeEnv, env };
}

test("синтаксис: bash -n", () => {
  const r = spawnSync("bash", ["-n", script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("deploy-check: без HIGH находки", () => {
  const f = lintShell(readFileSync(script, "utf8"), "offsite-backup.sh");
  assert.deepEqual(f.filter((x) => x.sev === "HIGH"), []);
});

test("отказва без root", { skip: isRoot && "върви като root" }, () => {
  const r = spawnSync("bash", [script, "backup"], { encoding: "utf8", env: { ...process.env, ENV_FILE: "/nonexistent" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /root/);
});

test("systemd: услугите викат скрипта до migrate-backup.sh, таймерите са в UTC", () => {
  const sd = join(here, "systemd");
  for (const [unit, verb] of [["offsite-backup", "backup"], ["offsite-verify", "verify"]]) {
    const svc = readFileSync(join(sd, `${unit}.service`), "utf8");
    assert.match(svc, new RegExp(`^ExecStart=/usr/local/sbin/offsite-backup\\.sh ${verb}$`, "m"));
    assert.match(svc, /^Type=oneshot$/m);
    const tim = readFileSync(join(sd, `${unit}.timer`), "utf8");
    assert.match(tim, new RegExp(`^Unit=${unit}\\.service$`, "m"));
    assert.match(tim, /^OnCalendar=.* UTC$/m);
    assert.match(tim, /^Persistent=true$/m);
  }
});

test("конфигът: по-широки права и непознат ключ се отказват; `&` в адреса не е shell", {
  skip: !isRoot && "иска root",
}, async () => {
  const s = sandbox();
  chmodSync(s.envFile, 0o644);
  let r = await run(["snapshots"], s.env);
  assert.equal(r.status, 1);
  assert.match(r.out, /600/);

  chmodSync(s.envFile, 0o600);
  const marker = join(s.t, "pwned");
  s.writeEnv([`RESTIC_REPOSITORY=${join(s.t, "repo")}`, `RESTIC_PASSWORD_FILE=${s.pass}`, `touch ${marker}`]);
  r = await run(["snapshots"], s.env);
  assert.equal(r.status, 1);
  assert.match(r.out, /ред 3/);
  s.writeEnv([`RESTIC_REPOSITORY=${join(s.t, "repo")}`, `RESTIC_PASSWORD_FILE=${s.pass}`, `PATH=/tmp`]);
  r = await run(["snapshots"], s.env);
  assert.match(r.out, /непознат ключ PATH/);
  // Като shell ред `&` пуска `touch` — тук е само текст в адреса.
  s.writeEnv([`RESTIC_REPOSITORY=${join(s.t, "repo")}`, `RESTIC_PASSWORD_FILE=${s.pass}`,
    `HEALTHCHECK_URL=http://127.0.0.1:9/x?a=1&touch ${marker}`]);
  await run(["snapshots"], s.env);
  assert.ok(!readdirSync(s.t).includes("pwned"), "редът от конфига се изпълни като команда");
  rmSync(s.t, { recursive: true, force: true });
});

test("init → backup → verify в пясъчник; повредена снимка пада; пинговете", {
  skip: (!isRoot && "иска root") || ((!has("restic") || !has("python3") || !has("curl")) && "липсва restic/python3/curl"),
}, async () => {
  const s = sandbox();
  const hits = [];
  const srv = createServer((req, res) => { hits.push(req.url); res.end("ok"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    const opt = join(s.t, "sbx", "opt");
    const data = join(opt, "app", "data");
    mkdirSync(data, { recursive: true });
    mkdirSync(join(opt, "app", "node_modules", "x"), { recursive: true });
    writeFileSync(join(opt, "app", "node_modules", "x", "f"), "big");
    const db = join(data, "app.db");
    const py = spawnSync("python3", ["-c",
      "import sqlite3,sys\nc=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA journal_mode=WAL');c.execute('create table t(x)');" +
      "c.executemany('insert into t values(?)',[(i,) for i in range(2000)]);c.commit();c.close()", db]);
    assert.equal(py.status, 0, String(py.stderr));
    s.writeEnv([`RESTIC_REPOSITORY=${join(s.t, "repo")}`, `RESTIC_PASSWORD_FILE=${s.pass}`,
      `HEALTHCHECK_URL=http://127.0.0.1:${port}/b?status=up`, `HEALTHCHECK_VERIFY_URL="http://127.0.0.1:${port}/v?status=up&msg=OK"`]);
    // Дъмповете живеят ВЪТРЕ в архивиран корен, както /var/backups на сървъра.
    const backups = join(s.t, "sbx", "backups");
    const dumps = join(backups, "offsite-dumps");
    const env = {
      ...s.env, ROOTS: `${opt} ${backups}`, DUMP_DIR: dumps, OUT_DIR: join(s.t, "out"),
      RELEASES_DIR: join(opt, "few-few", "releases"), CURRENT_LINK: join(opt, "few-few", "current"),
    };

    let r = await run(["init"], env);
    assert.equal(r.status, 0, r.out);
    r = await run(["backup"], env);
    assert.equal(r.status, 0, r.out);
    assert.equal(statSync(dumps).mode & 0o777, 0o700);
    const paths = readFileSync(join(dumps, "paths.txt"), "utf8").split("\n");
    // Първата нощ коренът `backups` още липсва → дъмповете влизат по свой път.
    assert.ok(paths.includes(opt) && paths.includes(dumps), paths.join(" | "));
    const ls = spawnSync("restic", ["ls", "latest"], {
      encoding: "utf8", env: { ...env, RESTIC_REPOSITORY: join(s.t, "repo"), RESTIC_PASSWORD_FILE: s.pass },
    }).stdout;
    assert.ok(ls.includes(db), "суровата база липсва в снимката");
    assert.ok(ls.includes(join(dumps, "sqlite") + db), "копието през backup API липсва");
    assert.ok(!ls.includes("node_modules"), "node_modules влезе в снимката");

    // Втора нощ: копието от миналата нощ НЕ се копира наново като SQLite база.
    r = await run(["backup"], env);
    assert.equal(r.status, 0, r.out);
    const paths2 = readFileSync(join(dumps, "paths.txt"), "utf8").split("\n");
    assert.ok(paths2.includes(backups) && !paths2.includes(dumps), paths2.join(" | "));
    const inv = readFileSync(join(dumps, "inventory.txt"), "utf8");
    assert.ok(inv.includes(`${db} · `), "базата липсва в инвентара");
    assert.ok(!inv.includes(join(dumps, "sqlite")), "дъмповете от миналата нощ влязоха като бази");

    r = await run(["verify"], env);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /всички се четат/);

    // Повредена SQLite в нова снимка → пробата пада и пингва /fail ПРЕДИ заявката.
    const copy = join(dumps, "sqlite") + db;
    const buf = readFileSync(copy);
    // Цялата втора страница: integrity_check хваща СТРУКТУРАТА, не байт в данните
    // (SQLite няма контролни суми — гниенето в хранилището хваща restic check).
    buf.fill(0xff, 4096, 8192);
    writeFileSync(copy, buf);
    const rb = spawnSync("restic", ["backup", "-q", "--host", spawnSync("hostname", ["-s"], { encoding: "utf8" }).stdout.trim(), "--tag", "nightly", dumps], {
      encoding: "utf8", env: { ...env, RESTIC_REPOSITORY: join(s.t, "repo"), RESTIC_PASSWORD_FILE: s.pass },
    });
    assert.equal(rb.status, 0, rb.stderr);
    r = await run(["verify"], env);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /не минават проверката/);
    assert.equal(readdirSync(s.t).filter((f) => f.startsWith("offsite-verify.")).length, 0, "възстановените дъмпове останаха на диска");

    // Провален дъмп → backup пада и пингва /fail.
    const failMig = join(s.t, "fail.sh");
    writeFileSync(failMig, "#!/bin/sh\nexit 1\n", { mode: 0o700 });
    r = await run(["backup"], { ...env, MIGRATE: failMig });
    assert.equal(r.status, 1, r.out);

    assert.deepEqual(hits, ["/b?status=up", "/b?status=up", "/v?status=up&msg=OK", "/v/fail?status=up&msg=OK", "/b/fail?status=up"]);
  } finally {
    srv.close();
    rmSync(s.t, { recursive: true, force: true });
  }
});
