// deploy/backup.sh (docs/documenti-spec.md D16а, L6-B): дъмп + моментна снимка с твърди връзки; всичко по-старо
// от срока (30 дни) се трие и когато бекъпът не мине; списъкът на изтриванията не се пипа. Docker е двойник.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEPLOY = join(dirname(fileURLToPath(import.meta.url)), "..", "deploy");
const BACKUP = join(DEPLOY, "backup.sh");

/** Време във формата на имената: 20261126T101500Z, `giorni` денонощия назад. */
const stamp = (giorni) => new Date(Date.now() - giorni * 86_400_000).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

function ambiente({ db = true, dumpOk = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "liftcon-backup-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  // Двойник на docker: `ps` вижда базата (или не); `exec … pg_dump` пише дъмп (или се проваля).
  writeFileSync(
    join(bin, "docker"),
    `#!/bin/sh\ncase "$1" in\n  ps) ${db ? 'echo liftcon-db-1; echo liftcon-api' : "echo liftcon-api"} ;;\n  exec) ${dumpOk ? 'echo "-- dump $*"' : "exit 1"} ;;\nesac\n`,
  );
  chmodSync(join(bin, "docker"), 0o755);
  const state = join(dir, "state");
  const foto = join(state, "data", "documenti", "d1", "f1.jpg");
  mkdirSync(dirname(foto), { recursive: true });
  writeFileSync(foto, "jpeg");
  mkdirSync(join(state, "eliminazioni"));
  writeFileSync(join(state, "eliminazioni", "eliminazioni.jsonl"), '{"tipo":"richiesta","id":"abc","il":"x"}\n');
  const b = join(state, "backup");
  mkdirSync(b);
  const vecchi = [`db-${stamp(31)}.sql.gz`, `data-${stamp(31)}.tar.gz`, `data-${stamp(45)}`];
  const recenti = [`db-${stamp(2)}.sql.gz`, `data-${stamp(28)}`];
  for (const n of [...vecchi, ...recenti]) {
    if (n.includes(".")) writeFileSync(join(b, n), "x");
    else mkdirSync(join(b, n));
  }
  writeFileSync(join(b, `db-${stamp(0)}.sql.gz.partial`), "a metà");
  const run = (args = [], env = {}) =>
    spawnSync("bash", [BACKUP, ...args], {
      env: { PATH: `${bin}:${process.env.PATH}`, LIFTCON_STATE_DIR: state, LIFTCON_LOCK: join(dir, "lock"), ...env },
      encoding: "utf8",
    });
  return { state, b, foto, vecchi, recenti, run };
}

const nuovi = (a, prefisso) => readdirSync(a.b).filter((n) => n.startsWith(prefisso) && !a.recenti.includes(n) && !a.vecchi.includes(n));

test("дневен бекъп: дъмп + моментна снимка с твърди връзки; по-старите от 30 дни се трият; списъкът не се пипа", () => {
  const a = ambiente();
  const r = a.run();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const [dump] = nuovi(a, "db-");
  assert.match(dump, /^db-\d{8}T\d{6}Z\.sql\.gz$/);
  assert.match(gunzipSync(readFileSync(join(a.b, dump))).toString(), /pg_dump -U liftcon -d liftcon --no-owner --clean --if-exists/);
  assert.equal((statSync(join(a.b, dump)).mode & 0o777).toString(8), "600");
  const [snap] = nuovi(a, "data-");
  const copia = join(a.b, snap, "documenti", "d1", "f1.jpg");
  assert.equal(statSync(copia).ino, statSync(a.foto).ino, "твърда връзка — без допълнително място");
  for (const n of a.vecchi) assert.equal(existsSync(join(a.b, n)), false, `изтекъл: ${n}`);
  for (const n of a.recenti) assert.ok(existsSync(join(a.b, n)), `в срока: ${n}`);
  assert.equal(readdirSync(a.b).some((n) => n.endsWith(".partial")), false, "без остатъци");
  assert.equal(readFileSync(join(a.state, "eliminazioni", "eliminazioni.jsonl"), "utf8"), '{"tipo":"richiesta","id":"abc","il":"x"}\n');
  assert.ok(existsSync(join(a.b, "LAST_OK")));
  assert.equal((statSync(a.b).mode & 0o777).toString(8), "700");
});

test("дъмпът не мина → изход 1, без половин файл; изтеклите пак се трият (срокът важи винаги)", () => {
  const a = ambiente({ dumpOk: false });
  const r = a.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pg_dump/);
  assert.deepEqual(nuovi(a, "db-"), []);
  for (const n of a.vecchi) assert.equal(existsSync(join(a.b, n)), false, `изтекъл: ${n}`);
  assert.equal(existsSync(join(a.b, "LAST_OK")), false);
});

test("ключалката е заета (деплой) → изход 1, но изтеклите пак се трият; без нов бекъп", async () => {
  const a = ambiente();
  const lock = join(dirname(a.state), "lock");
  // Държи ключалката, както deploy.sh по време на деплой.
  const holder = spawn("flock", [lock, "sleep", "10"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 50 && !existsSync(lock); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 100));
    const r = a.run([], { LIFTCON_LOCK_WAIT: "1" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /още тече/);
    for (const n of a.vecchi) assert.equal(existsSync(join(a.b, n)), false, `изтекъл: ${n}`);
    for (const n of a.recenti) assert.ok(existsSync(join(a.b, n)), `в срока: ${n}`);
    // Без ключалката недовършеното (може да е на деплоя, който я държи) не се пипа; нов бекъп няма.
    assert.deepEqual(nuovi(a, "db-"), [readdirSync(a.b).find((n) => n.endsWith(".partial"))]);
  } finally {
    holder.kill();
  }
});

test("дневен без работеща база → изход 1; при деплой (първи) — само снимката на файловете, изход 0", () => {
  assert.equal(ambiente({ db: false }).run().status, 1);
  const a = ambiente({ db: false });
  const r = a.run(["--deploy"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(nuovi(a, "db-"), []);
  assert.equal(nuovi(a, "data-").length, 1);
});

test("срок над 30 дни или не число → отказ преди всичко", () => {
  for (const giorni of ["31", "0", "trenta", "-5"]) {
    const a = ambiente();
    const r = a.run([], { LIFTCON_BACKUP_GIORNI: giorni });
    assert.equal(r.status, 2, giorni);
    for (const n of a.vecchi) assert.ok(existsSync(join(a.b, n)), "нищо не е пипнато");
  }
  const a = ambiente();
  assert.equal(a.run([], { LIFTCON_BACKUP_GIORNI: "7" }).status, 0);
  // Имената — от ambiente() (повторно `stamp()` може да падне в друга секунда).
  const [db2, data28] = a.recenti;
  assert.equal(existsSync(join(a.b, data28)), false, "по-кратък срок — по-малко бекъпи");
  assert.ok(existsSync(join(a.b, db2)));
});

test("deploy.sh: бекъп преди деплоя през backup.sh, общата ключалка, таймерът и папката на изтриванията", () => {
  const deploy = readFileSync(join(DEPLOY, "deploy.sh"), "utf8");
  assert.match(deploy, /bash "\$HERE\/backup\.sh" --deploy \|\| die/);
  assert.match(deploy, /flock -w 600 9/);
  assert.match(deploy, /LIFTCON_ELIMINAZIONI_DIR="\$ELIM_DIR"/);
  assert.match(deploy, /chown "\$NODE_UID:\$NODE_UID" "\$DATA_DIR" "\$ELIM_DIR"/);
  assert.match(deploy, /systemctl enable --now liftcon-backup\.timer/);
  assert.doesNotMatch(deploy, /tail -n \+(4|11)/, "без ротация по брой — само по срок");
  const service = readFileSync(join(DEPLOY, "systemd", "liftcon-backup.service"), "utf8");
  assert.match(service, /^ExecStart=\/usr\/local\/sbin\/liftcon-backup$/m);
  assert.match(service, /^Wants=docker\.service$/m, "и без Docker срокът се прилага");
  assert.doesNotMatch(service, /^Requires=/m);
  assert.match(readFileSync(join(DEPLOY, "systemd", "liftcon-backup.timer"), "utf8"), /^OnCalendar=\*-\*-\* 04:10:00 UTC$/m);
  const compose = readFileSync(join(DEPLOY, "..", "docker-compose.yml"), "utf8");
  assert.match(compose, /ELIMINAZIONI_DIR: \/srv\/eliminazioni/);
  assert.match(compose, /\$\{LIFTCON_ELIMINAZIONI_DIR:-\/opt\/few-few\/shared\/liftcon\/eliminazioni\}:\/srv\/eliminazioni/);
});
