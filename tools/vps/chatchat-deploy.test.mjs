// chatchat-deploy.test.mjs — chatchat/deploy/deploy.sh и backup.sh, пуснати ИСТИНСКИ (bash) върху временна
// файлова система: docker, curl, nginx и systemctl са заместени с функции, които пишат в дневник какво са
// извикани. Unit-ите и скриптовете на таймерите отиват във временни папки. Бекъпът е с истински age.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEPLOY_FILES = ["deploy.sh", "backup.sh", "retention.sh", "timers-install.sh", "clamav/clamd.conf",
  "nginx/chatchat.carbonstealth.eu.conf", "systemd/chatchat-backup.service", "systemd/chatchat-backup.timer",
  "systemd/chatchat-retention.service", "systemd/chatchat-retention.timer", "monitoring.sh", "monitoring/audit-verify.sh",
  "monitoring/systemd/chatchat-audit-verify.service", "monitoring/systemd/chatchat-audit-verify.timer"];
const mode = (p) => (statSync(p).mode & 0o777).toString(8);
const hasAge = spawnSync("age", ["--version"]).status === 0;

function layout() {
  const base = mkdtempSync(join(tmpdir(), "chatchat-deploy-"));
  const app = join(base, "release", "chatchat");
  for (const f of DEPLOY_FILES) {
    mkdirSync(dirname(join(app, "deploy", f)), { recursive: true });
    copyFileSync(join(root, "chatchat", "deploy", f), join(app, "deploy", f));
  }
  for (const d of ["systemd", "sbin"]) mkdirSync(join(base, d));
  return { base, app, shared: join(base, "shared"), log: join(base, "log.txt"),
    systemd: join(base, "systemd"), sbin: join(base, "sbin"), etc: join(base, "etc") };
}
const withLayout = (run) => { const L = layout(); try { run(L); } finally { rmSync(L.base, { recursive: true, force: true }); } };

function sharedEnv(L, extra = "") {
  mkdirSync(L.shared, { recursive: true });
  writeFileSync(join(L.shared, ".env"), `PUBLIC_BASE_URL=https://chatchat.carbonstealth.eu\nPOSTGRES_PASSWORD=abc123\nSESSION_PEPPER=p\n${extra}`);
}

const STUBS = `
id() { echo 0; }
sleep() { :; }
install() {
  local a=()
  while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2 ;; *) a+=("$1"); shift ;; esac; done
  command install "\${a[@]}"
}
docker() {
  echo "docker $*" >> "$LOG"
  case "$*" in
    "compose version") return 0 ;;
    "volume inspect chatchat_db-data") return "$VOLUME_RC" ;;
    "compose config --images") printf '%s\\n' chatchat-app 'pgvector/pgvector:0.8.7-pg16@sha256:aa' ;;
    "image inspect"*) return "$IMAGE_RC" ;;
    "compose exec -T db pg_dump"*) [ "$DUMP_RC" = 0 ] && echo "-- dump"; return "$DUMP_RC" ;;
    "compose exec -T db psql"*"REINDEX"*) return "$REINDEX_RC" ;;
    "compose exec -T db psql -X -q -v ON_ERROR_STOP=1 -U chatchat -d chatchat") cat >> "$LOG.sql"; return "$ROLES_RC" ;;
    "compose exec -T db psql"*) echo 1 ;;
    "compose build app") return "$BUILD_RC" ;;
    "compose up -d --remove-orphans") return "$UP_RC" ;;
    "compose exec -T app node dist/cli/files.js encrypt") return "$FILES_RC" ;;
    "compose ps -q worker") echo wcid ;;
    "inspect -f {{.State.Health.Status}} wcid") echo "$WORKER_HEALTH" ;;
  esac
  return 0
}
curl() { echo "curl \${*: -1}" >> "$LOG"; printf '%s' "$HEALTH_BODY"; }
mountpoint() { echo "mountpoint $*" >> "$LOG"; [ "$PGDATA_MOUNTED" = 1 ]; }
nginx() { echo "nginx $*" >> "$LOG"; }
systemctl() { echo "systemctl $*" >> "$LOG"; return 0; }
`;

function deploy(L, env = {}) {
  const res = spawnSync("bash", ["-c", `source "$SCRIPT"\n${STUBS}\nmain`], {
    encoding: "utf8",
    env: { ...process.env, SCRIPT: join(L.app, "deploy", "deploy.sh"), LOG: L.log,
      CHATCHAT_SHARED: L.shared, CHATCHAT_LE_DIR: join(L.base, "le"), CHATCHAT_HEALTH_WAIT: "0",
      CHATCHAT_SYSTEMD_DIR: L.systemd, CHATCHAT_SBIN: L.sbin, CHATCHAT_AGE: "true",
      VOLUME_RC: "1", IMAGE_RC: "0", DUMP_RC: "0", REINDEX_RC: "0", BUILD_RC: "0", UP_RC: "0", FILES_RC: "0", ROLES_RC: "0",
      CHATCHAT_PGDATA_CONF_DIR: L.etc, PGDATA_MOUNTED: "0",
      HEALTH_BODY: '{"ok":true,"ai":false}', WORKER_HEALTH: "healthy", ...env },
  });
  const log = existsSync(L.log) ? readFileSync(L.log, "utf8") : "";
  writeFileSync(L.log, "");
  return { status: res.status, stderr: res.stderr, log };
}
const order = (log, ...steps) => {
  let at = -1;
  for (const s of steps) {
    const i = log.indexOf(s, at + 1);
    assert.ok(i > at, `„${s}“ идва след предишната стъпка\n${log}`);
    at = i;
  }
};

test("няма .env: изход 3, нищо не се строи", () => withLayout((L) => {
  const r = deploy(L);
  assert.equal(r.status, 3);
  assert.doesNotMatch(r.log, /compose build/);
}));

test("пръв деплой: ключовете се раждат в shared/.env (600), папките и конфигът са на място, маркер и last-good", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L);
  assert.equal(r.status, 0, r.stderr);
  const env = readFileSync(join(L.shared, ".env"), "utf8");
  assert.match(env, /^ATTACHMENT_URL_KEY=\S{40,}$/m);
  assert.match(env, /^MFA_ENC_KEY=\S{40,}$/m);
  assert.match(env, /^FILES_KEK=\S{40,}$/m);
  assert.equal(Buffer.from(env.match(/^FILES_KEK=(\S+)$/m)[1], "base64").length, 32, "KEK — 32 байта");
  assert.match(env, /^INTEGRATION_KEK=\S{40,}$/m, "ключът на тайните на helpdesk конектора");
  assert.equal(Buffer.from(env.match(/^INTEGRATION_KEK=(\S+)$/m)[1], "base64").length, 32, "INTEGRATION_KEK — 32 байта");
  assert.notEqual(env.match(/^INTEGRATION_KEK=(\S+)$/m)[1], env.match(/^FILES_KEK=(\S+)$/m)[1], "отделен ключ");
  assert.match(env, /^SSO_KEK=\S{40,}$/m, "ключът за client secret на единния вход");
  assert.equal(Buffer.from(env.match(/^SSO_KEK=(\S+)$/m)[1], "base64").length, 32, "SSO_KEK — 32 байта");
  assert.match(env, /^REDIS_PASSWORD=[0-9a-f]{64}$/m, "паролата на Redis — hex (влиза в REDIS_URL)");
  assert.equal(mode(join(L.shared, ".env")), "600");
  assert.doesNotMatch(r.stderr + r.log, /ATTACHMENT_URL_KEY=|MFA_ENC_KEY=|FILES_KEK=|INTEGRATION_KEK=|SSO_KEK=|REDIS_PASSWORD=/, "стойностите не се печатат");
  assert.doesNotMatch(r.stderr, /worker-ът не е здрав/, "здрав worker — без предупреждение");
  order(r.log, "/readyz", "compose exec -T app node dist/cli/files.js encrypt");
  assert.match(r.stderr, /pgdata-encrypt\.sh enable/, "подсказва шифрования том на базата");
  assert.equal(readFileSync(join(L.app, ".env"), "utf8"), env, "release-ът носи същия .env");
  assert.equal(mode(join(L.shared, "attachments")), "700");
  assert.equal(mode(join(L.shared, "eval-reports")), "755", "отчетите на оценката — само за четене от приложението");
  assert.equal(readFileSync(join(L.shared, "clamd.conf"), "utf8"), readFileSync(join(L.app, "deploy", "clamav", "clamd.conf"), "utf8"));
  assert.doesNotMatch(r.log, /pg_dump|REINDEX/, "няма том — няма бекъп и REINDEX");
  assert.ok(existsSync(join(L.shared, ".db-pgvector")));
  assert.equal(readFileSync(join(L.shared, "last-good"), "utf8").trim(), L.app);
  for (const u of ["chatchat-backup.timer", "chatchat-retention.service"]) assert.ok(existsSync(join(L.systemd, u)), u);
  assert.match(readFileSync(join(L.systemd, "chatchat-backup.service"), "utf8"), new RegExp(`ReadWritePaths=${L.shared}/backups/daily`));
  assert.ok(existsSync(join(L.sbin, "chatchat-backup")) && existsSync(join(L.sbin, "chatchat-retention")));
  assert.match(r.log, /systemctl enable --now chatchat-backup\.timer chatchat-retention\.timer/);
}));

test("съществуващи ключове не се пипат", () => withLayout((L) => {
  sharedEnv(L, "ATTACHMENT_URL_KEY=old-a\nMFA_ENC_KEY=old-m\n");
  assert.equal(deploy(L).status, 0);
  const env = readFileSync(join(L.shared, ".env"), "utf8");
  assert.equal(env.match(/MFA_ENC_KEY=/g).length, 1);
  assert.match(env, /^MFA_ENC_KEY=old-m$/m);
}));

test("съществуващ INTEGRATION_KEK не се пипа, липсващ се дописва веднъж", () => withLayout((L) => {
  sharedEnv(L, "INTEGRATION_KEK=old-i\n");
  assert.equal(deploy(L).status, 0);
  assert.equal(deploy(L).status, 0);
  const env = readFileSync(join(L.shared, ".env"), "utf8");
  assert.equal(env.match(/^INTEGRATION_KEK=/gm).length, 1);
  assert.match(env, /^INTEGRATION_KEK=old-i$/m);
}));

test("съществуваща база без маркер: бекъп → базата на новия образ → REINDEX → up", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L, { VOLUME_RC: "0" });
  assert.equal(r.status, 0, r.stderr);
  order(r.log, "compose build app", "compose up -d --no-recreate --wait db", "pg_dump", "compose up -d --no-deps --wait db",
    "REINDEX DATABASE chatchat", "compose up -d --remove-orphans", "/readyz");
  assert.equal(readdirSync(join(L.shared, "backups")).filter((f) => f.startsWith("pre-deploy-")).length, 1);
  assert.ok(existsSync(join(L.shared, ".db-pgvector")));
}));

test("маркерът е налице: бекъп, но без REINDEX", () => withLayout((L) => {
  sharedEnv(L);
  writeFileSync(join(L.shared, ".db-pgvector"), "x\n");
  const r = deploy(L, { VOLUME_RC: "0" });
  assert.equal(r.status, 0);
  assert.match(r.log, /pg_dump/);
  assert.doesNotMatch(r.log, /REINDEX/);
}));

test("провален дъмп: изход 1, контейнерите не са сменени", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L, { VOLUME_RC: "0", DUMP_RC: "1" });
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.log, /--remove-orphans|REINDEX/);
}));

test("провален REINDEX: изход 4 (базата вече е сменена), без маркер", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L, { VOLUME_RC: "0", REINDEX_RC: "1" });
  assert.equal(r.status, 4);
  assert.ok(!existsSync(join(L.shared, ".db-pgvector")));
}));

test("CHATCHAT_SKIP_BACKUP=1 (откат): без нов дъмп", () => withLayout((L) => {
  sharedEnv(L);
  writeFileSync(join(L.shared, ".db-pgvector"), "x\n");
  const r = deploy(L, { VOLUME_RC: "0", CHATCHAT_SKIP_BACKUP: "1" });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.log, /pg_dump/);
}));

test("сондата не вижда ChatChat (чуждо тяло): изход 4, last-good не се пише", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L, { HEALTH_BODY: '{"ok":true}' });
  assert.equal(r.status, 4);
  assert.ok(!existsSync(join(L.shared, "last-good")));
}));

test("build пада: изход 1, без up", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L, { BUILD_RC: "1" });
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.log, /compose up/);
}));

test("липсващ образ по digest се тегли преди смяната (не и образът от build)", () => withLayout((L) => {
  sharedEnv(L);
  const ok = deploy(L, { IMAGE_RC: "1" });
  assert.match(ok.log, /docker pull -q pgvector\/pgvector:0\.8\.7-pg16@sha256:aa/);
  assert.doesNotMatch(ok.log, /pull -q chatchat-app/, "образът от build не се тегли");
}));

test("паролата на базата с / ? # % @: изход 1 преди build", () => withLayout((L) => {
  mkdirSync(L.shared, { recursive: true });
  writeFileSync(join(L.shared, ".env"), "POSTGRES_PASSWORD=a/b\n");
  const r = deploy(L);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.log, /compose build/);
}));

test("паролата на Redis с /, :, @ или +: изход 1 преди build (чупи REDIS_URL)", () => withLayout((L) => {
  for (const bad of ["a/b", "a:b", "a@b", "a+b="]) {
    sharedEnv(L, `REDIS_PASSWORD=${bad}\n`);
    const r = deploy(L);
    assert.equal(r.status, 1, bad);
    assert.match(r.stderr, /REDIS_PASSWORD/);
    assert.doesNotMatch(r.log, /compose build/);
  }
}));

// ── Ролите на базата (RLS, NFR-03): chatchat_app / chatchat_system ─────────────────────────────────
test("ролите на базата: подравнени ПРЕДИ up, паролите — hex от .env и само през stdin, правата — chatchat_apply_grants()", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L);
  assert.equal(r.status, 0, r.stderr);
  order(r.log, "compose up -d --no-recreate --wait db", "compose exec -T db psql -X -q -v ON_ERROR_STOP=1 -U chatchat -d chatchat\n",
    "compose up -d --remove-orphans");
  const env = readFileSync(join(L.shared, ".env"), "utf8");
  const app = env.match(/^APP_DB_PASSWORD=([0-9a-f]{64})$/m)?.[1];
  const sys = env.match(/^SYSTEM_DB_PASSWORD=([0-9a-f]{64})$/m)?.[1];
  assert.ok(app && sys && app !== sys, "две различни hex пароли");
  const sql = readFileSync(`${L.log}.sql`, "utf8");
  assert.match(sql, /CREATE ROLE chatchat_app'.*\\gexec/);
  assert.match(sql, new RegExp(`ALTER ROLE chatchat_app WITH LOGIN .*NOBYPASSRLS PASSWORD '${app}';`));
  assert.match(sql, new RegExp(`ALTER ROLE chatchat_system WITH LOGIN .* BYPASSRLS PASSWORD '${sys}';`));
  assert.match(sql, /PERFORM public\.chatchat_apply_grants\(\)/);
  assert.doesNotMatch(r.log + r.stderr, new RegExp(`${app}|${sys}`), "паролите — нито в аргументите, нито в изхода");
  // Втори пробег: паролите остават същите (ролята се подравнява, не се сменя).
  assert.equal(deploy(L).status, 0);
  assert.equal(readFileSync(join(L.shared, ".env"), "utf8"), env);
}));

test("ролите на базата не се подравниха: изход 1 преди up (работещото не е пипано)", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L, { ROLES_RC: "1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /chatchat_app\/chatchat_system/);
  assert.doesNotMatch(r.log, /compose up -d --remove-orphans/);
}));

test("парола на роля на базата с непозволен знак: изход 1 преди build", () => withLayout((L) => {
  for (const name of ["APP_DB_PASSWORD", "SYSTEM_DB_PASSWORD"]) {
    sharedEnv(L, `${name}=a'b\n`);
    const r = deploy(L);
    assert.equal(r.status, 1, name);
    assert.match(r.stderr, new RegExp(name));
    assert.doesNotMatch(r.log, /compose build/);
  }
}));

test("нездрав worker след up: само предупреждение, изход 0 (API-то работи, опашката чака)", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L, { WORKER_HEALTH: "starting" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /worker-ът не е здрав/);
  order(r.log, "compose up -d --remove-orphans", "/readyz", "compose ps -q worker");
}));

test("сменен clamd.conf: clamav се рестартира след up; същият — не", () => withLayout((L) => {
  sharedEnv(L);
  writeFileSync(join(L.shared, "clamd.conf"), "стар\n");
  const r = deploy(L);
  assert.equal(r.status, 0);
  order(r.log, "compose up -d --remove-orphans", "compose restart clamav");
  assert.doesNotMatch(deploy(L).log, /restart clamav/);
}));

// ── backup.sh: истински age, docker е заглушка ───────────────────────────────────────────────────
test("бекъп: две шифровани половини (база + файлове), 600, .sha256, разшифроват се с ключа", { skip: !hasAge && "няма age" }, () => withLayout((L) => {
  const key = join(L.base, "key.txt");
  execFileSync("age-keygen", ["-o", key], { stdio: "ignore" });
  const pub = execFileSync("age-keygen", ["-y", key], { encoding: "utf8" });
  mkdirSync(join(L.shared, "attachments", "t1"), { recursive: true });
  writeFileSync(join(L.shared, "attachments", "t1", "snimka.jpg"), "JPEG");
  writeFileSync(join(L.shared, "backup-recipients.txt"), pub, { mode: 0o600 });
  const stub = `docker() {
    case "$*" in
      "ps -q --filter label=com.docker.compose.project=chatchat --filter label=com.docker.compose.service=db") echo cid ;;
      "exec -i cid pg_dump"*) head -c 20000 /dev/zero | tr '\\0' 'x' ;;
      "exec -i cid pg_restore"*) cat >/dev/null ;;
    esac
  }`;
  const res = spawnSync("bash", ["-c", `source "$SCRIPT"\n${stub}\nbackup`], { encoding: "utf8",
    env: { ...process.env, SCRIPT: join(L.app, "deploy", "backup.sh"), CHATCHAT_SHARED: L.shared } });
  assert.equal(res.status, 0, res.stderr);
  const dir = join(L.shared, "backups", "daily");
  const files = readdirSync(dir).filter((f) => !f.startsWith("."));
  const dump = files.find((f) => /^chatchat-\d{8}-\d{6}\.dump\.age$/.test(f));
  const tar = files.find((f) => /^chatchat-\d{8}-\d{6}\.files\.tar\.age$/.test(f));
  assert.ok(dump && tar, files.join(","));
  assert.equal(dump.replace(".dump.age", ""), tar.replace(".files.tar.age", ""), "двете половини са със същия час");
  for (const f of [dump, tar]) {
    assert.equal(mode(join(dir, f)), "600");
    assert.ok(files.includes(`${f}.sha256`));
  }
  const plain = execFileSync("age", ["-d", "-i", key, join(dir, dump)]);
  assert.equal(plain.length, 20000);
  const tarPlain = execFileSync("age", ["-d", "-i", key, join(dir, tar)]);
  const listing = execFileSync("tar", ["-tf", "-"], { input: tarPlain, encoding: "utf8" });
  assert.match(listing, /t1\/snimka\.jpg/);
  assert.doesNotMatch(res.stdout + res.stderr, /JPEG|xxxx/, "логът не носи данни");
}));

test("бекъп без получател: отказ, нищо не е записано", () => withLayout((L) => {
  mkdirSync(L.shared, { recursive: true });
  const res = spawnSync("bash", [join(L.app, "deploy", "backup.sh")], { encoding: "utf8",
    env: { ...process.env, CHATCHAT_SHARED: L.shared, CHATCHAT_AGE: "true" } });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /няма получател/);
  assert.ok(!existsSync(join(L.shared, "backups", "daily")) || readdirSync(join(L.shared, "backups", "daily")).every((f) => f.startsWith(".")));
}));

// ── шифроване в покой (NFR-03): FILES_KEK, преходът на файловете, шифрованият том на базата ─────────
test("files:encrypt пада след сондата: само предупреждение, изход 0", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L, { FILES_RC: "1" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /шифроването на старите прикачени файлове не завърши/);
}));

function encrypted(L) {
  mkdirSync(L.etc, { recursive: true });
  writeFileSync(join(L.etc, "pgdata.conf"), "MODE=keyfile\nSTATE=encrypted\n");
  mkdirSync(join(L.shared, "pgdata", "data"), { recursive: true });
}
const LINE = "COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml";

test("базата в шифрования том, но томът не е отключен: изход 1 преди build — никога върху стария том", () => withLayout((L) => {
  sharedEnv(L, `${LINE}\n`);
  encrypted(L);
  const r = deploy(L, { VOLUME_RC: "0" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /chatchat-pgdata open/);
  assert.doesNotMatch(r.log, /compose build|compose up/);
}));

test("базата в шифрования том без COMPOSE_FILE в .env: изход 1 (compose би вдигнал стария том)", () => withLayout((L) => {
  sharedEnv(L);
  encrypted(L);
  const r = deploy(L, { VOLUME_RC: "0", PGDATA_MOUNTED: "1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /не я вдигам върху стария том/);
  assert.doesNotMatch(r.log, /compose build/);
}));

test("COMPOSE_FILE сочи шифрования том, а той не е настроен: изход 1", () => withLayout((L) => {
  sharedEnv(L, `${LINE}\n`);
  const r = deploy(L);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.log, /compose build/);
}));

test("отключен шифрован том: дъмпът преди миграция е в тома (не на некриптирания диск), без подсказка", () => withLayout((L) => {
  sharedEnv(L, `${LINE}\n`);
  encrypted(L);
  writeFileSync(join(L.shared, ".db-pgvector"), "x\n");
  writeFileSync(join(L.shared, "pgdata", "data", "PG_VERSION"), "16\n");
  const r = deploy(L, { PGDATA_MOUNTED: "1" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.log, /pg_dump/, "старият том го няма, но базата е в шифрования — бекъпът е задължителен");
  assert.equal(readdirSync(join(L.shared, "pgdata", "pre-deploy")).filter((f) => f.startsWith("pre-deploy-")).length, 1);
  assert.ok(!existsSync(join(L.shared, "backups")) || !readdirSync(join(L.shared, "backups")).some((f) => f.startsWith("pre-deploy-")));
  assert.doesNotMatch(r.stderr, /pgdata-encrypt\.sh enable/);
}));

test("FILES_KEK липсва, а има шифровани файлове: изход 1, нов ключ НЕ се ражда (не би ги отворил)", () => withLayout((L) => {
  sharedEnv(L, "ATTACHMENT_URL_KEY=a\nMFA_ENC_KEY=m\n");
  const dir = join(L.shared, "attachments", "t1", "2026", "10");
  mkdirSync(dir, { recursive: true });
  const magic = Buffer.from([0x89, 0x43, 0x43, 0x45, 0x4e, 0x43, 0x0d, 0x0a]);
  writeFileSync(join(dir, "0123456789abcdef0123456789abcdef"), Buffer.concat([magic, Buffer.alloc(200, 1)]));
  const r = deploy(L);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /нов ключ НЕ ги отваря/);
  assert.doesNotMatch(readFileSync(join(L.shared, ".env"), "utf8"), /^FILES_KEK=/m);
  assert.doesNotMatch(r.log, /compose build/);
  // Само нешифровани (отпреди шифроването) → ключът се ражда.
  writeFileSync(join(dir, "0123456789abcdef0123456789abcdef"), Buffer.alloc(200, 0x41));
  assert.equal(deploy(L).status, 0);
  assert.match(readFileSync(join(L.shared, ".env"), "utf8"), /^FILES_KEK=\S{40,}$/m);
}));

// ── мониторингът (deploy/monitoring.sh) е по избор: деплоят само напомня ───────────────────────────
test("мониторингът не е включен: само напомняне, изход 0, без таймер за одита", () => withLayout((L) => {
  sharedEnv(L);
  const r = deploy(L);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /мониторингът .* не е включен — веднъж: sudo bash .*deploy\/monitoring\.sh/);
  assert.ok(!existsSync(join(L.systemd, "chatchat-audit-verify.timer")));
}));

test("мониторингът е включен (и шифрованият том): COMPOSE_FILE-списъкът минава, таймерът за одита се подравнява", () => withLayout((L) => {
  sharedEnv(L, "COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml:docker-compose.monitoring.yml\n");
  encrypted(L);
  writeFileSync(join(L.shared, ".db-pgvector"), "x\n");
  writeFileSync(join(L.shared, "pgdata", "data", "PG_VERSION"), "16\n");
  const r = deploy(L, { PGDATA_MOUNTED: "1" });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /мониторингът .* не е включен/);
  assert.ok(existsSync(join(L.systemd, "chatchat-audit-verify.timer")));
  assert.ok(existsSync(join(L.sbin, "chatchat-audit-verify")));
  assert.match(r.log, /systemctl enable --now chatchat-audit-verify\.timer/);
}));
