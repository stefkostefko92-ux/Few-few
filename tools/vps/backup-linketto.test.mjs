// backup-linketto.test.mjs — дневният шифрован бекъп на Linketto (linketto/deploy/linketto-cron.sh
// backup) и проверката на възстановяването (tools/vps/backup-verify.sh linketto-verify).
//
// Тестът е ИЗПЪЛНИМ: истинският скрипт с bash, истински age (ключове, генерирани тук), а `docker`
// е заглушка в PATH, която връща дъмп-фикстура, списък миграции и tar на снимки. Проверката на
// възстановяването иска PostgreSQL: LINKETTO_VERIFY_PG_URL_TEST=postgresql://postgres@127.0.0.1:5432/postgres
// (+ PGPASSWORD) — без него тази част се пропуска. Без age се пропуска всичко.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, chmodSync, existsSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CRON = join(root, "linketto", "deploy", "linketto-cron.sh");
const VERIFY = join(root, "tools", "vps", "backup-verify.sh");
const hasAge = spawnSync("age", ["--version"]).status === 0;
const PG = process.env.LINKETTO_VERIFY_PG_URL_TEST ?? "";

// Дъмп във формата на pg_dump (текстов): таблица с ред, в който има екраниран нов ред.
const T = "\t";
const DUMP = [
  "SET client_encoding = 'UTF8';",
  // Като истинския pg_dump: име с малки букви е БЕЗ кавички (public._prisma_migrations).
  'CREATE TABLE public._prisma_migrations (id character varying(36) NOT NULL, checksum character varying(64) NOT NULL, finished_at timestamp with time zone, migration_name character varying(255) NOT NULL, logs text, rolled_back_at timestamp with time zone, started_at timestamp with time zone DEFAULT now() NOT NULL, applied_steps_count integer DEFAULT 0 NOT NULL);',
  'CREATE TABLE public."User" (id text NOT NULL, email text NOT NULL, bio text);',
  'CREATE TABLE public."Empty" (id text NOT NULL);',
  'COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;',
  ["m1", "c1", "2026-11-01 00:00:00+00", "20261101000000_init", "\\N", "\\N", "2026-11-01 00:00:00+00", "1"].join(T),
  ["m2", "c2", "2026-11-02 00:00:00+00", "20261102000000_more", "\\N", "\\N", "2026-11-02 00:00:00+00", "1"].join(T),
  "\\.",
  'COPY public."User" (id, email, bio) FROM stdin;',
  ["u1", "first@example.invalid", "ред\\nвтори"].join(T),
  ["u2", "second@example.invalid", "\\N"].join(T),
  ["u3", "third@example.invalid", "таб\\tтук"].join(T),
  "\\.",
  'COPY public."Empty" (id) FROM stdin;',
  "\\.",
  "",
].join("\n");

function setup({ app = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), "lnk-backup-"));
  const L = { base, bin: join(base, "bin"), daily: join(base, "daily"), env: join(base, ".env"),
    key: join(base, "key.txt"), uploads: join(base, "data") };
  mkdirSync(L.bin); mkdirSync(join(L.uploads, "uploads"), { recursive: true });
  writeFileSync(join(L.uploads, "uploads", "a1.webp"), "x");
  writeFileSync(join(L.uploads, "uploads", "b2.webp"), "y");
  writeFileSync(join(base, "dump.sql"), DUMP);
  execFileSync("age-keygen", ["-o", L.key], { stdio: "ignore" });
  L.pub = execFileSync("age-keygen", ["-y", L.key], { encoding: "utf8" }).trim();
  writeFileSync(L.env, `CRON_SECRET=${"c".repeat(40)}\nBACKUP_AGE_RECIPIENTS=${L.pub}\n`);
  // Заглушката на docker: различава извикванията по аргументите.
  writeFileSync(join(L.bin, "docker"), `#!/usr/bin/env bash
case "$*" in
  "ps -q"*"service=db"*) echo dbcid ;;
  "ps -q"*"service=app"*) ${app ? "echo appcid" : ":"} ;;
  "exec dbcid pg_dump"*) cat "${join(base, "dump.sql")}" ;;
  "exec dbcid psql"*migration_name*) printf '20261101000000_init\\n20261102000000_more\\n' ;;
  "exec appcid"*"wc -l"*) find "${join(L.uploads, "uploads")}" -type f | wc -l ;;
  "exec appcid"*tar*) tar -C "${L.uploads}" -czf - uploads ;;
  *) echo "docker заглушка: непознато $*" >&2; exit 9 ;;
esac
`);
  chmodSync(join(L.bin, "docker"), 0o755);
  return L;
}

function backup(L, extraEnv = {}) {
  return spawnSync("bash", [CRON, "backup"], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${L.bin}:${process.env.PATH}`, LINKETTO_ENV: L.env,
      LINKETTO_BACKUP_DIR: L.daily, LINKETTO_BACKUP_KEEP: "2", ...extraEnv },
  });
}
const sets = (L) => (existsSync(L.daily) ? readdirSync(L.daily).filter((n) => /^\d{8}T\d{6}Z$/.test(n)).sort() : []);
const decrypt = (L, file) => execFileSync("age", ["-d", "-i", L.key, file], { encoding: "utf8" });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

test("бекъп: шифрован набор, броят редове е в манифеста, нищо нешифровано на диска", { skip: !hasAge && "няма age" }, () => {
  const L = setup();
  const r = backup(L);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /3 таблици, 5 реда, 2 снимки/);
  const [s] = sets(L);
  const dir = join(L.daily, s);
  assert.deepEqual(readdirSync(dir).sort(), ["SHA256SUMS", "db.sql.gz.age", "manifest.txt.age", "uploads.tar.gz.age"]);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  for (const f of readdirSync(dir)) {
    assert.equal(statSync(join(dir, f)).mode & 0o077, 0, `${f} е само за собственика`);
    assert.ok(!readFileSync(join(dir, f)).includes("example.invalid"), `${f} не съдържа данни в чист вид`);
  }
  const manifest = decrypt(L, join(dir, "manifest.txt.age"));
  assert.match(manifest, /^linketto-backup 1\n/);
  assert.match(manifest, /^rows public\."User" 3$/m);
  assert.match(manifest, /^rows public\."Empty" 0$/m);
  assert.match(manifest, /^rows public\._prisma_migrations 2$/m);
  assert.match(manifest, /^migration 20261102000000_more$/m);
  assert.match(manifest, /^uploads 2$/m);
  // Дъмпът се разшифрова до точно фикстурата.
  const dump = execFileSync("bash", ["-c", `age -d -i "$1" "$2" | gzip -dc`, "_", L.key, join(dir, "db.sql.gz.age")], { encoding: "utf8" });
  assert.equal(dump, DUMP);
  rmSync(L.base, { recursive: true, force: true });
});

test("бекъп: ротация пази последните LINKETTO_BACKUP_KEEP набора", { skip: !hasAge && "няма age" }, () => {
  const L = setup();
  for (let i = 0; i < 3; i++) {
    assert.equal(backup(L).status, 0);
    sleep(1100); // имената са по секунда
  }
  assert.equal(sets(L).length, 2);
  rmSync(L.base, { recursive: true, force: true });
});

test("бекъп: fail-closed без публичен ключ, с невалиден или с ЧАСТЕН ключ в конфигурацията", { skip: !hasAge && "няма age" }, () => {
  const L = setup();
  writeFileSync(L.env, "BACKUP_AGE_RECIPIENTS=\n");
  let r = backup(L);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /празен/);
  writeFileSync(L.env, "BACKUP_AGE_RECIPIENTS=age1notavalidkey\n");
  r = backup(L);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /невалиден получател/);
  writeFileSync(L.env, `BACKUP_AGE_RECIPIENTS=${L.pub}\n# ${readFileSync(L.key, "utf8").split("\n").find((l) => l.startsWith("AGE-"))}\n`);
  r = backup(L);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ЧАСТЕН age ключ/);
  assert.equal(sets(L).length, 0, "нито един набор");
  rmSync(L.base, { recursive: true, force: true });
});

test("бекъп: без app базата пак се бекъпва, но unit-ът пада", { skip: !hasAge && "няма age" }, () => {
  const L = setup({ app: false });
  const r = backup(L);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /снимките НЕ са/);
  const [s] = sets(L);
  assert.ok(s, "наборът с базата е записан");
  assert.ok(!existsSync(join(L.daily, s, "uploads.tar.gz.age")));
  assert.match(decrypt(L, join(L.daily, s, "manifest.txt.age")), /^uploads missing$/m);
  rmSync(L.base, { recursive: true, force: true });
});

function verify(L, extraEnv = {}, identity = readFileSync(L.key, "utf8")) {
  return spawnSync("bash", [VERIFY, "linketto-verify", "--identity", "-"], {
    encoding: "utf8", input: identity,
    env: { ...process.env, LINKETTO_BACKUP_DIR: L.daily, LINKETTO_VERIFY_PG_URL: PG,
      LINKETTO_MIGRATIONS_DIR: join(L.base, "no-such-dir"), ...extraEnv },
  });
}

test("проверка: възстановяване във временна база — редове, миграции, снимки", { skip: (!hasAge && "няма age") || (!PG && "няма LINKETTO_VERIFY_PG_URL_TEST") }, () => {
  const L = setup();
  assert.equal(backup(L).status, 0);
  const r = verify(L);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Редове: 3 таблици, 5 реда — съвпадат/);
  assert.match(r.stdout, /Миграции: 2 приложени — съвпадат/);
  assert.match(r.stdout, /Снимки: 2 — съвпадат/);
  assert.ok(!(r.stdout + r.stderr).includes("example.invalid"), "данни не се печатат");
  rmSync(L.base, { recursive: true, force: true });
});

test("проверка: подменен манифест, повреден файл и грешен ключ се хващат", { skip: (!hasAge && "няма age") || (!PG && "няма LINKETTO_VERIFY_PG_URL_TEST") }, () => {
  const L = setup();
  assert.equal(backup(L).status, 0);
  const dir = join(L.daily, sets(L)[0]);
  // Грешен ключ.
  const other = join(L.base, "other.txt");
  execFileSync("age-keygen", ["-o", other], { stdio: "ignore" });
  let r = verify(L, {}, readFileSync(other, "utf8"));
  assert.notEqual(r.status, 0);
  // Манифест с друг брой редове (пре-шифрован, с нови суми) → сверката пада.
  const m = decrypt(L, join(dir, "manifest.txt.age")).replace('rows public."User" 3', 'rows public."User" 4');
  execFileSync("age", ["-r", L.pub, "-o", join(dir, "manifest.txt.age")], { input: m });
  execFileSync("bash", ["-c", 'cd "$1" && sha256sum db.sql.gz.age uploads.tar.gz.age manifest.txt.age > SHA256SUMS', "_", dir]);
  r = verify(L);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /public\."User": 4 в манифеста, 3 възстановени/);
  // Повреден файл без нови суми → sha256 пада преди всичко.
  writeFileSync(join(dir, "uploads.tar.gz.age"), "повреден");
  r = verify(L);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /SHA256SUMS не съвпада/);
  rmSync(L.base, { recursive: true, force: true });
});

test("проверка: без ключ не тръгва; restic не е нужен", { skip: !hasAge && "няма age" }, () => {
  const L = setup();
  assert.equal(backup(L).status, 0);
  const r = spawnSync("bash", [VERIFY, "linketto-verify"], {
    encoding: "utf8", env: { ...process.env, LINKETTO_BACKUP_DIR: L.daily, RESTIC_REPOSITORY: "" },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /иска --identity/);
  rmSync(L.base, { recursive: true, force: true });
});

// Режимът по подразбиране на сървъра (временен контейнер без мрежа). Иска docker и образа на
// postgres — затова само при LINKETTO_VERIFY_DOCKER_TEST=1. Пази регресия: `docker exec -i` в цикъла
// изяждаше stdin и сверяваше само първата таблица от манифеста.
test("проверка: временен контейнер — всички таблици от манифеста", { skip: (!hasAge && "няма age") || (process.env.LINKETTO_VERIFY_DOCKER_TEST !== "1" && "без LINKETTO_VERIFY_DOCKER_TEST=1") }, () => {
  const L = setup();
  // Заглушката пуска всичко непознато към истинския docker (run/exec/rm на временния контейнер).
  const shim = readFileSync(join(L.bin, "docker"), "utf8").replace(/\*\) echo "docker заглушка[^\n]*/, '*) exec /usr/bin/docker "$@" ;;');
  writeFileSync(join(L.bin, "docker"), shim);
  assert.equal(backup(L).status, 0);
  const r = verify(L, { LINKETTO_VERIFY_PG_URL: "" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Редове: 3 таблици, 5 реда — съвпадат/);
  rmSync(L.base, { recursive: true, force: true });
});
