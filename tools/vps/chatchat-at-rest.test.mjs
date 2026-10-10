// chatchat-at-rest.test.mjs — шифроването в покой на ChatChat (NFR-03): chatchat/deploy/pgdata-encrypt.sh
// (LUKS2 том за данните на PostgreSQL + миграция без загуба) и пробата за възстановяване на файловете
// (files-restore.sh проверява и разшифроването). Скриптовете се пускат ИСТИНСКИ (bash) върху временна
// файлова система; cryptsetup, blkid, mount, docker и systemctl са заместени с функции, които пишат в
// дневник и пазят състоянието във файлове. Истински диск не се пипа никога (реален LUKS прогон иска
// cryptsetup и device-mapper — в CI ги няма).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mode = (p) => (statSync(p).mode & 0o777).toString(8);
const LINE = "COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml";

function layout() {
  const base = mkdtempSync(join(tmpdir(), "chatchat-at-rest-"));
  const app = join(base, "release", "chatchat");
  for (const f of ["deploy/pgdata-encrypt.sh", "deploy/systemd/chatchat-pgdata.service", "deploy/backup.sh",
    "deploy/files-restore.sh", "docker-compose.pgdata.yml", "docker-compose.yml"]) {
    mkdirSync(dirname(join(app, f)), { recursive: true });
    copyFileSync(join(root, "chatchat", f), join(app, f));
  }
  const L = { base, app, shared: join(base, "shared"), etc: join(base, "etc"), st: join(base, "st"),
    systemd: join(base, "systemd"), sbin: join(base, "sbin"), log: join(base, "log.txt") };
  for (const d of [L.shared, L.st, L.systemd, L.sbin, join(L.shared, "backups")]) mkdirSync(d, { recursive: true });
  const env = "POSTGRES_PASSWORD=abc\nFILES_KEK=k\n";
  writeFileSync(join(L.shared, ".env"), env, { mode: 0o600 });
  writeFileSync(join(app, ".env"), env, { mode: 0o600 });
  L.mount = join(L.shared, "pgdata");
  return L;
}
const withLayout = (run) => { const L = layout(); try { run(L); } finally { rmSync(L.base, { recursive: true, force: true }); } };

// Състоянието на заглушките: st/luks (има LUKS), st/open, st/fs (ext4 в тома), st/mounted; базата —
// st/db-old (томът db-data) и st/db-new (шифрованият), според реда COMPOSE_FILE в .env на release-а.
const STUBS = `
id() { echo 0; }
install() {
  local a=()
  while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2 ;; *) a+=("$1"); shift ;; esac; done
  command install "\${a[@]}"
}
is_block() { [ -n "\${FAKE_BLOCK:-}" ]; }
cryptsetup() {
  echo "cryptsetup $*" >> "$LOG"
  case "$1" in
    isLuks) [ -f "$ST/luks" ] ;;
    luksFormat) touch "$ST/luks"; echo uuid-1 > "$ST/uuid" ;;
    luksUUID) [ -f "$ST/luks" ] && cat "$ST/uuid" ;;
    status) [ -f "$ST/open" ] ;;
    open) if [ "$2" = --test-passphrase ]; then return "\${TEST_RC:-0}"; fi; touch "$ST/open" ;;
    close) rm -f "$ST/open" ;;
  esac
}
blkid() {
  echo "blkid $*" >> "$LOG"
  case "\${@: -1}" in
    /dev/mapper/*) [ -f "$ST/fs" ] || return 2; echo ext4 ;;
    *) [ -n "\${DEVICE_SIG:-}" ] && return 0; return 2 ;;
  esac
}
make_fs() { echo "make_fs $*" >> "$LOG"; touch "$ST/fs"; }
mountpoint() { [ -f "$ST/mounted" ]; }
mount() { echo "mount $*" >> "$LOG"; touch "$ST/mounted"; }
umount() { echo "umount $*" >> "$LOG"; rm -f "$ST/mounted"; }
systemctl() { echo "systemctl $*" >> "$LOG"; }
docker() {
  echo "docker $*" >> "$LOG"
  local db="$ST/db-old"
  if grep -qxF '${LINE}' "$APP/.env" 2>/dev/null; then db="$ST/db-new"; fi
  case "$*" in
    "compose version"|info) return 0 ;;
    "volume inspect chatchat_db-data") return "\${VOLUME_RC:-1}" ;;
    "compose up -d --wait db"|"compose up -d --no-recreate --wait db")
      if [ "$db" = "$ST/db-new" ] && [ ! -d "$MOUNT/data" ]; then return 1; fi
      [ -f "$db" ] || : > "$db" ;;
    "compose exec -T db psql"*pg_database_size*) echo 1000 ;;
    "compose exec -T db psql"*query_to_xml*) cat "$db" ;;
    "compose exec -T db pg_dump"*) cat "$db" ;;
    "compose exec -T db pg_restore -l"|"compose exec -T db pg_restore -f /dev/null") cat >/dev/null ;;
    "compose exec -T db pg_restore --exit-on-error"*)
      if [ "\${RESTORE_BAD:-0}" = 1 ]; then cat >/dev/null; echo "Tenant=0" > "$db"; else cat > "$db"; fi ;;
    "ps -aq --filter label=com.docker.compose.project=chatchat --filter label=com.docker.compose.service=db") echo id-db ;;
    "ps -aq --filter label=com.docker.compose.project=chatchat --filter label=com.docker.compose.service=app") echo id-app ;;
  esac
  return 0
}
`;

function pg(L, cmd, env = {}) {
  const res = spawnSync("bash", ["-c", `source "$SCRIPT"\n${STUBS}\nmain ${cmd}`], {
    encoding: "utf8",
    env: { ...process.env, SCRIPT: join(L.app, "deploy", "pgdata-encrypt.sh"), LOG: L.log, ST: L.st, APP: L.app,
      MOUNT: L.mount, CHATCHAT_SHARED: L.shared, CHATCHAT_PGDATA_CONF_DIR: L.etc, CHATCHAT_SYSTEMD_DIR: L.systemd,
      CHATCHAT_SBIN: L.sbin, CHATCHAT_PGDATA_SIZE: "64M", CHATCHAT_PGDATA_MARGIN_BYTES: "0", ...env },
  });
  const log = existsSync(L.log) ? readFileSync(L.log, "utf8") : "";
  writeFileSync(L.log, "");
  return { status: res.status, out: res.stdout + res.stderr, log };
}
const order = (log, ...steps) => {
  let at = -1;
  for (const s of steps) {
    const i = log.indexOf(s, at + 1);
    assert.ok(i > at, `„${s}“ идва след предишната стъпка\n${log}`);
    at = i;
  }
};
const conf = (L) => readFileSync(join(L.etc, "pgdata.conf"), "utf8");
const lines = (f) => readFileSync(f, "utf8").split("\n").filter((l) => l === LINE).length;

test("нова инсталация (файл): ключ 0400, sparse LUKS2, ext4 веднъж, монтиран nodev/nosuid/noexec, unit, COMPOSE_FILE", () => withLayout((L) => {
  const r = pg(L, "enable");
  assert.equal(r.status, 0, r.out);
  const key = join(L.etc, "pgdata.key");
  assert.equal(mode(key), "400");
  assert.equal(statSync(key).size, 64);
  assert.doesNotMatch(r.out, new RegExp(readFileSync(key).toString("base64").slice(0, 16).replace(/[+/]/g, ".")), "ключът не се печата");
  const file = join(L.shared, "pgdata.luks");
  assert.equal(statSync(file).size, 64 * 1024 * 1024);
  assert.ok(statSync(file).blocks * 512 < 1024 * 1024, "sparse — не заема мястото си");
  assert.equal(mode(file), "600");
  assert.match(r.log, /cryptsetup luksFormat --batch-mode --type luks2 --cipher aes-xts-plain64 --key-size 512 --hash sha256 --pbkdf argon2id --label chatchat-pgdata --key-file \S+pgdata\.key \S+pgdata\.luks/);
  assert.equal((r.log.match(/^make_fs /gm) || []).length, 1);
  assert.match(r.log, /make_fs \/dev\/mapper\/chatchat-pgdata/);
  assert.match(r.log, new RegExp(`mount -o nodev,nosuid,noexec /dev/mapper/chatchat-pgdata ${L.mount}`));
  assert.equal(mode(join(L.mount, "data")), "700");
  for (const f of [join(L.shared, ".env"), join(L.app, ".env")]) assert.equal(lines(f), 1, f);
  const c = conf(L);
  for (const want of ["STATE=encrypted", "MODE=keyfile", "BACKING=file", `SOURCE=${file}`, "UUID=uuid-1", "FS=ext4"]) {
    assert.ok(c.split("\n").includes(want), `${want}\n${c}`);
  }
  assert.equal(mode(join(L.etc, "pgdata.conf")), "600");
  const unit = readFileSync(join(L.systemd, "chatchat-pgdata.service"), "utf8");
  assert.match(unit, /^Before=docker\.service$/m);
  assert.doesNotMatch(unit, /^Requires=docker/m, "Docker не зависи от тома — другите продукти тръгват");
  assert.ok(unit.includes(`ExecStart=${L.sbin}/chatchat-pgdata open --boot`));
  assert.ok(unit.includes(`ConditionPathExists=${L.etc}/pgdata.conf`));
  assert.equal(mode(join(L.sbin, "chatchat-pgdata")), "700");
  assert.match(r.log, /systemctl enable chatchat-pgdata\.service/);
  assert.doesNotMatch(r.log, /pg_dump/, "няма стара база — няма миграция");
}));

test("повторно пускане: идемпотентно — без нов LUKS, без ново ext4, един ред COMPOSE_FILE", () => withLayout((L) => {
  assert.equal(pg(L, "enable").status, 0);
  rmSync(join(L.st, "mounted"));
  rmSync(join(L.st, "open"));
  const again = pg(L, "enable");
  assert.equal(again.status, 0, again.out);
  assert.doesNotMatch(again.log, /luksFormat|make_fs/);
  assert.match(again.log, /cryptsetup open --type luks2 --key-file/);
  assert.match(again.out, /вече са в шифрования том/);
  assert.equal(lines(join(L.shared, ".env")), 1);
}));

test("миграция от db-data: app спира → броеве → дъмп в тома → проверка → нов клъстер → restore → същите броеве → app", () => withLayout((L) => {
  writeFileSync(join(L.st, "db-old"), "AuditEvent=12\nTenant=2\naudit=12:abc\n");
  writeFileSync(join(L.shared, "backups", "pre-deploy-20261001-010101.sql.gz"), "plain");
  const r = pg(L, "enable", { VOLUME_RC: "0" });
  assert.equal(r.status, 0, r.out);
  order(r.log, "compose up -d --no-recreate --wait db", "pg_database_size", "compose stop app", "query_to_xml",
    "pg_dump -Fc -U chatchat -d chatchat", "pg_restore -l", "pg_restore -f /dev/null", "compose stop db",
    "compose up -d --wait db", "pg_restore --exit-on-error --single-transaction --no-owner --no-acl", "query_to_xml",
    "docker compose up -d\n");
  assert.equal(readFileSync(join(L.st, "db-new"), "utf8"), readFileSync(join(L.st, "db-old"), "utf8"));
  assert.ok(conf(L).includes("STATE=encrypted"));
  const dumps = readdirSync(join(L.mount, "migration"));
  assert.equal(dumps.length, 1);
  assert.match(dumps[0], /^pre-luks-\d{8}-\d{6}\.dump$/);
  assert.equal(mode(join(L.mount, "migration", dumps[0])), "600");
  assert.ok(existsSync(join(L.mount, "pre-deploy", "pre-deploy-20261001-010101.sql.gz")), "старите дъмпове — в тома");
  assert.ok(!existsSync(join(L.shared, "backups", "pre-deploy-20261001-010101.sql.gz")));
  assert.doesNotMatch(r.log, /volume rm/, "старият том остава до ръчно изтриване");
  assert.match(r.out, /docker volume rm chatchat_db-data/);
  assert.equal(lines(join(L.app, ".env")), 1);
}));

test("миграция с разминаване в броевете: автоматично връщане на стария том, нищо не е изгубено", () => withLayout((L) => {
  writeFileSync(join(L.st, "db-old"), "Tenant=2\naudit=12:abc\n");
  const r = pg(L, "enable", { VOLUME_RC: "0", RESTORE_BAD: "1" });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /НЕ съвпадат/);
  assert.match(r.out, /миграцията е върната/);
  order(r.log, "pg_restore --exit-on-error", "query_to_xml", "compose stop db", "compose up -d --wait db", "docker compose up -d\n");
  for (const f of [join(L.shared, ".env"), join(L.app, ".env")]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /^COMPOSE_FILE=/m, "compose е пак на стария том");
  }
  assert.equal(readFileSync(join(L.st, "db-old"), "utf8"), "Tenant=2\naudit=12:abc\n");
  assert.doesNotMatch(conf(L), /STATE=encrypted/);
  assert.ok(readdirSync(L.mount).some((f) => f.startsWith("data.failed-")), "провалените данни — настрана");
  // Следващият опит минава.
  const again = pg(L, "enable", { VOLUME_RC: "0" });
  assert.equal(again.status, 0, again.out);
  assert.ok(conf(L).includes("STATE=encrypted"));
}));

test("устройство с файлова система/дялове: отказ, нищо не се форматира", () => withLayout((L) => {
  const r = pg(L, "enable", { CHATCHAT_PGDATA_DEVICE: "/dev/fake-vol", FAKE_BLOCK: "1", DEVICE_SIG: "1" });
  assert.equal(r.status, 1);
  assert.match(r.out, /wipefs/);
  assert.doesNotMatch(r.log, /luksFormat/);
}));

test("празно устройство: LUKS2 върху него, конфигът помни носителя", () => withLayout((L) => {
  const r = pg(L, "enable", { CHATCHAT_PGDATA_DEVICE: "/dev/fake-vol", FAKE_BLOCK: "1" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.log, /luksFormat .* \/dev\/fake-vol/);
  assert.ok(conf(L).includes("BACKING=device") && conf(L).includes("SOURCE=/dev/fake-vol"));
  assert.ok(!existsSync(join(L.shared, "pgdata.luks")));
}));

test("съществуващ том без ключ / чужд файл на мястото на тома: отказ без нов ключ и без форматиране", () => withLayout((L) => {
  writeFileSync(join(L.st, "luks"), "");
  writeFileSync(join(L.shared, "pgdata.luks"), "x");
  const lost = pg(L, "enable");
  assert.equal(lost.status, 1);
  assert.match(lost.out, /ключът .* липсва/);
  assert.ok(!existsSync(join(L.etc, "pgdata.key")), "нов ключ не отваря стария том — не се прави");
  rmSync(join(L.st, "luks"));
  const foreign = pg(L, "enable");
  assert.equal(foreign.status, 1);
  assert.match(foreign.out, /не е LUKS/);
  assert.doesNotMatch(foreign.log, /luksFormat/);
}));

test("ротация на ключа: luksAddKey (със стария) → проба с новия → luksRemoveKey на стария → новият файл 0400", () => withLayout((L) => {
  assert.equal(pg(L, "enable").status, 0);
  const key = join(L.etc, "pgdata.key");
  const old = readFileSync(key);
  const r = pg(L, "rotate-key");
  assert.equal(r.status, 0, r.out);
  order(r.log, `cryptsetup luksAddKey --batch-mode --key-file ${key} `, `cryptsetup open --test-passphrase --key-file ${key}.new`,
    `cryptsetup luksRemoveKey --batch-mode `);
  assert.ok(r.log.includes(`luksRemoveKey --batch-mode ${join(L.shared, "pgdata.luks")} ${key}`));
  assert.notDeepEqual(readFileSync(key), old);
  assert.equal(mode(key), "400");
  assert.ok(!existsSync(`${key}.new`));
  // Новият не отваря → старият остава, нищо не се маха.
  const kept = readFileSync(key);
  const bad = pg(L, "rotate-key", { TEST_RC: "1" });
  assert.equal(bad.status, 1);
  assert.doesNotMatch(bad.log, /luksRemoveKey/);
  assert.deepEqual(readFileSync(key), kept);
}));

test("отключване: при старт в ръчен режим чака човек (без да спира Docker); ръчно — отключва, монтира, пуска db и app", () => withLayout((L) => {
  assert.equal(pg(L, "enable").status, 0);
  assert.equal(pg(L, "close").status, 0);
  assert.ok(!existsSync(join(L.st, "open")) && !existsSync(join(L.st, "mounted")));
  writeFileSync(join(L.etc, "pgdata.conf"), `${conf(L)}MODE=manual\n`);
  const boot = pg(L, "open --boot");
  assert.equal(boot.status, 0);
  assert.match(boot.out, /чака паролата/);
  assert.doesNotMatch(boot.log, /cryptsetup open/);
  writeFileSync(join(L.etc, "pgdata.conf"), `${conf(L)}MODE=keyfile\n`);
  const manual = pg(L, "open");
  assert.equal(manual.status, 0, manual.out);
  order(manual.log, "cryptsetup open --type luks2 --key-file", "mount -o nodev,nosuid,noexec", "docker start id-db",
    "docker start id-app");
  const close = pg(L, "close");
  order(close.log, "docker stop id-app", "docker stop id-db", "umount", "cryptsetup close chatchat-pgdata");
}));

test("друг LUKS том на същия път (UUID): не се отключва", () => withLayout((L) => {
  assert.equal(pg(L, "enable").status, 0);
  assert.equal(pg(L, "close").status, 0);
  writeFileSync(join(L.st, "uuid"), "uuid-2\n");
  const r = pg(L, "open");
  assert.equal(r.status, 1);
  assert.match(r.out, /друг LUKS том/);
  assert.doesNotMatch(r.log, /cryptsetup open/);
}));

// ── files-restore.sh: пробата разопакова И разшифрова ────────────────────────────────────────────
function restore(L, verifyRc) {
  const src = join(L.base, "src");
  mkdirSync(join(src, "t1", "2026", "10"), { recursive: true });
  writeFileSync(join(src, "t1", "2026", "10", "0123456789abcdef0123456789abcdef"), "шифротекст");
  const tar = execFileSync("tar", ["-C", src, "-cf", "-", "."]);
  const into = join(L.base, "proba");
  const stub = `id() { echo 0; }
chown() { :; }
install() {
  local a=()
  while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2 ;; *) a+=("$1"); shift ;; esac; done
  command install "\${a[@]}"
}
docker() { echo "docker $* @ $PWD" >> "$LOG"; return ${verifyRc}; }`;
  const res = spawnSync("bash", ["-c", `source "$SCRIPT"\n${stub}\nmain --into "$INTO" -`], {
    input: tar, encoding: "utf8",
    env: { ...process.env, SCRIPT: join(L.app, "deploy", "files-restore.sh"), LOG: L.log, INTO: into,
      CHATCHAT_SHARED: L.shared },
  });
  const log = existsSync(L.log) ? readFileSync(L.log, "utf8") : "";
  return { status: res.status, out: res.stdout + res.stderr, log, into };
}

test("проба за възстановяване на файловете: всеки файл се разшифрова с ключовете на сървъра", () => withLayout((L) => {
  const ok = restore(L, 0);
  assert.equal(ok.status, 0, ok.out);
  assert.ok(ok.log.includes(`docker compose run --rm --no-deps -T -v ${ok.into}:/restore:ro --entrypoint node app dist/cli/files.js verify --root /restore @ ${L.app}`));
  assert.match(ok.out, /разшифровани докрай/);
}));

test("проба с грешен/загубен FILES_KEK: пада и казва защо", () => withLayout((L) => {
  const bad = restore(L, 1);
  assert.notEqual(bad.status, 0);
  assert.match(bad.out, /НЕ се разшифроват с FILES_KEK/);
}));
