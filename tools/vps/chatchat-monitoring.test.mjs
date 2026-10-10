// chatchat-monitoring.test.mjs — мониторингът на ChatChat: chatchat/deploy/monitoring.sh,
// deploy/monitoring/audit-verify.sh и entrypoint.sh, пуснати ИСТИНСКИ (bash/sh) върху временна файлова
// система; docker, curl, systemctl и chown са заместени с функции, които пишат в дневник. Плюс: всяка
// аларма има severity/component/runbook раздел; promtool/amtool (ако са в PATH или PROMTOOL/AMTOOL) върху
// изобразените конфиги; `docker compose config` с и без docker-compose.monitoring.yml (ако има docker).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cc = join(root, "chatchat");
const mon = join(cc, "deploy", "monitoring");
const mode = (p) => (statSync(p).mode & 0o777).toString(8);
const tool = (env, name) => {
  const bin = process.env[env] || name;
  return spawnSync(bin, ["--version"]).status === 0 ? bin : null;
};
const PROMTOOL = tool("PROMTOOL", "promtool");
const AMTOOL = tool("AMTOOL", "amtool");
const hasDocker = spawnSync("docker", ["compose", "version"]).status === 0;

// ── алармите: договорът с Alertmanager (inhibit по component) и с runbook-а ─────────────────────────
test("всяка аларма: severity page|ticket, component, runbook_url към съществуващ раздел", () => {
  const runbook = readFileSync(join(cc, "docs", "runbook.md"), "utf8");
  const anchors = new Set([...runbook.matchAll(/^## (\w+)$/gm)].map((m) => m[1].toLowerCase()));
  let count = 0;
  for (const file of ["alerts.yml", "infra-alerts.yml"]) {
    const text = readFileSync(join(mon, file), "utf8");
    const blocks = text.split(/\n(?=\s*- (?:alert|record): )/).filter((b) => /^\s*- alert: /.test(b));
    for (const b of blocks) {
      const name = b.match(/- alert: (\w+)/)[1];
      count += 1;
      assert.match(b, /\n\s+severity: (page|ticket)\n/, `${name}: severity`);
      assert.match(b, /\n\s+component: [a-z-]+\n/, `${name}: component (иначе inhibit потиска чужди тикети)`);
      const url = b.match(/runbook_url: '[^']*#(\w+)'/);
      assert.ok(url, `${name}: runbook_url`);
      assert.equal(url[1], name.toLowerCase(), `${name}: котвата е името на алармата`);
      assert.ok(anchors.has(url[1]), `${name}: в docs/runbook.md няма раздел „## ${name}“`);
    }
  }
  assert.ok(count >= 25, `аларми: ${count}`);
});

// ── entrypoint.sh: шаблоните се изобразяват само с проверени стойности ─────────────────────────────
function render(what, env) {
  const out = mkdtempSync(join(tmpdir(), "chatchat-render-"));
  const res = spawnSync("sh", [join(mon, "entrypoint.sh"), what], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, RENDER_ONLY: "1", RENDER_DIR: out, TEMPLATE_DIR: mon, RULES_DIR: mon, ...env },
  });
  return { ...res, out };
}
function secrets(user = "abc123@smtp-brevo.com") {
  const dir = mkdtempSync(join(tmpdir(), "chatchat-sec-"));
  writeFileSync(join(dir, "smtp-user"), `${user}\n`);
  writeFileSync(join(dir, "smtp-password"), "xsmtpsib-proba\n");
  return dir;
}
const AM_ENV = { ALERT_EMAIL_TO: "ops@example.eu,owner@example.eu", ALERT_EMAIL_FROM: "alerts@example.eu" };

test("entrypoint: валидни стойности → конфиг 600; promtool/amtool го приемат", () => {
  const p = render("prometheus", { PUBLIC_BASE_URL: "https://chatchat.example.eu/" });
  const sec = secrets();
  const a = render("alertmanager", { ...AM_ENV, SECRETS_DIR: sec });
  try {
    assert.equal(p.status, 0, p.stderr);
    assert.equal(a.status, 0, a.stderr);
    const prom = readFileSync(join(p.out, "prometheus.yml"), "utf8");
    assert.match(prom, /- targets: \['https:\/\/chatchat\.example\.eu\/healthz'\]/, "без двойна наклонена черта");
    assert.doesNotMatch(prom, /__[A-Z_]+__/);
    const am = readFileSync(join(a.out, "alertmanager.yml"), "utf8");
    assert.doesNotMatch(am, /__[A-Z_]+__/);
    assert.doesNotMatch(am, /xsmtpsib-proba/, "паролата остава във файла, не в конфига");
    assert.match(am, /smtp_auth_password_file: '.*\/smtp-password'/);
    assert.match(am, /smtp_smarthost: 'smtp-relay\.brevo\.com:2525'/);
    assert.equal(mode(join(a.out, "alertmanager.yml")), "600");
    if (PROMTOOL) {
      const r = spawnSync(PROMTOOL, ["check", "config", join(p.out, "prometheus.yml")], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stdout + r.stderr);
    }
    if (AMTOOL) {
      const r = spawnSync(AMTOOL, ["check-config", join(a.out, "alertmanager.yml")], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stdout + r.stderr);
    }
  } finally {
    for (const d of [p.out, a.out, sec]) rmSync(d, { recursive: true, force: true });
  }
});

test("entrypoint: невалидна настройка или опит за инжекция → изход 64, нищо не е изобразено", () => {
  const sec = secrets();
  const cases = [
    ["prometheus", { PUBLIC_BASE_URL: "http://chatchat.example.eu" }],
    ["prometheus", { PUBLIC_BASE_URL: "https://x.eu|y" }],
    ["alertmanager", { ...AM_ENV, ALERT_EMAIL_TO: "", SECRETS_DIR: sec }],
    ["alertmanager", { ...AM_ENV, ALERT_EMAIL_TO: "a@b.eu\nroute: {}", SECRETS_DIR: sec }],
    ["alertmanager", { ...AM_ENV, ALERT_EMAIL_TO: "a@b.eu'|x", SECRETS_DIR: sec }],
    ["alertmanager", { ...AM_ENV, ALERT_EMAIL_FROM: "", SECRETS_DIR: sec }],
    ["alertmanager", { ...AM_ENV, ALERT_SMTP_SMARTHOST: "smtp.eu:25'", SECRETS_DIR: sec }],
    ["alertmanager", { ...AM_ENV, SECRETS_DIR: join(sec, "няма") }],
  ];
  try {
    for (const [what, env] of cases) {
      const r = render(what, env);
      assert.equal(r.status, 64, `${what} ${JSON.stringify(env)}: ${r.stderr}`);
      assert.ok(!existsSync(join(r.out, `${what}.yml`)), "нищо не е изобразено");
      rmSync(r.out, { recursive: true, force: true });
    }
    const badUser = secrets("user'with quote");
    const r = render("alertmanager", { ...AM_ENV, SECRETS_DIR: badUser });
    assert.equal(r.status, 64);
    rmSync(badUser, { recursive: true, force: true });
    rmSync(r.out, { recursive: true, force: true });
  } finally {
    rmSync(sec, { recursive: true, force: true });
  }
});

test("promtool: правилата и unit тестовете им минават", { skip: !PROMTOOL && "няма promtool" }, () => {
  for (const args of [["check", "rules", "alerts.yml", "infra-alerts.yml"], ["test", "rules", "alerts.test.yml", "infra-alerts.test.yml"]]) {
    const r = spawnSync(PROMTOOL, args, { cwd: mon, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
});

// ── monitoring.sh ──────────────────────────────────────────────────────────────────────────────────
const FILES = ["deploy/monitoring.sh", "deploy/monitoring/audit-verify.sh", "deploy/monitoring/systemd/chatchat-audit-verify.service",
  "deploy/monitoring/systemd/chatchat-audit-verify.timer", "docker-compose.monitoring.yml"];

function layout() {
  const base = mkdtempSync(join(tmpdir(), "chatchat-monitoring-"));
  const app = join(base, "release", "chatchat");
  for (const f of FILES) {
    mkdirSync(dirname(join(app, f)), { recursive: true });
    copyFileSync(join(cc, f), join(app, f));
  }
  const L = { base, app, shared: join(base, "shared"), log: join(base, "log.txt"), sql: join(base, "sql.txt"),
    systemd: join(base, "systemd"), sbin: join(base, "sbin") };
  for (const d of [L.shared, L.systemd, L.sbin]) mkdirSync(d, { recursive: true });
  writeFileSync(join(L.shared, "last-good"), `${app}\n`);
  return L;
}
const withLayout = (run) => { const L = layout(); try { run(L); } finally { rmSync(L.base, { recursive: true, force: true }); } };
const ENV_OK = "PUBLIC_BASE_URL=https://chatchat.example.eu\nPOSTGRES_PASSWORD=abc\nALERT_EMAIL_TO=ops@example.eu\nMAIL_FROM_EMAIL=no-reply@example.eu\n";
function configured(L, extra = "") {
  writeFileSync(join(L.shared, ".env"), ENV_OK + extra, { mode: 0o600 });
  const sec = join(L.shared, "monitoring", "secrets");
  mkdirSync(sec, { recursive: true });
  writeFileSync(join(sec, "smtp-user"), "abc@smtp-brevo.com\n");
  writeFileSync(join(sec, "smtp-password"), "xsmtpsib-proba\n");
}

const STUBS = `
id() { echo 0; }
sleep() { :; }
chown() { echo "chown $*" >> "$LOG"; }
install() {
  local a=()
  while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2 ;; *) a+=("$1"); shift ;; esac; done
  command install "\${a[@]}"
}
docker() {
  echo "docker $*" >> "$LOG"
  case "$*" in
    "compose version") return 0 ;;
    "compose config --images") printf '%s\\n' chatchat-app 'quay.io/prometheus/prometheus:v3@sha256:aa' ;;
    "image inspect"*) return "$IMAGE_RC" ;;
    "compose exec -T db psql"*) cat >> "$SQL" ;;
    "compose up -d --no-build") return "$UP_RC" ;;
  esac
  return 0
}
curl() {
  echo "curl $*" >> "$LOG"
  case "$*" in
    */-/ready*) return "$READY_RC" ;;
    */api/v1/rules*) printf '{"data":{"groups":[{"rules":[{"type":"alerting"},{"type":"alerting"},{"type":"recording"}]}]}}' ;;
    *"query=up == 0"*) printf '{"data":{"result":[%s]}}' "$DOWN" ;;
    *"query=count(count by (job) (up))"*) printf '{"data":{"result":[{"metric":{},"value":[1,"8"]}]}}' ;;
    *query=count*) printf '{"data":{"result":[{"metric":{},"value":[1,"1"]}]}}' ;;
  esac
}
systemctl() { echo "systemctl $*" >> "$LOG"; return "$SYSTEMCTL_RC"; }
`;

function run(L, cmd = "enable", env = {}) {
  const res = spawnSync("bash", ["-c", `source "$SCRIPT"\n${STUBS}\nmain ${cmd}`], {
    encoding: "utf8",
    env: { ...process.env, SCRIPT: join(L.app, "deploy", "monitoring.sh"), LOG: L.log, SQL: L.sql,
      CHATCHAT_SHARED: L.shared, CHATCHAT_SYSTEMD_DIR: L.systemd, CHATCHAT_SBIN: L.sbin, CHATCHAT_MONITORING_WAIT: "0",
      IMAGE_RC: "0", UP_RC: "0", READY_RC: "0", SYSTEMCTL_RC: "0", DOWN: "", ...env },
  });
  const log = existsSync(L.log) ? readFileSync(L.log, "utf8") : "";
  writeFileSync(L.log, "");
  return { status: res.status, out: res.stdout + res.stderr, log };
}
const composeLines = (f) => readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("COMPOSE_FILE="));

test("няма .env: изход 3, нищо не е пипнато", () => withLayout((L) => {
  const r = run(L);
  assert.equal(r.status, 3, r.out);
  assert.doesNotMatch(r.log, /compose up/);
}));

test("липсват получател и SMTP тайни: изход 3, празни файлове 400 с ясни указания, стекът НЕ тръгва", () => withLayout((L) => {
  writeFileSync(join(L.shared, ".env"), "PUBLIC_BASE_URL=https://chatchat.example.eu\n", { mode: 0o600 });
  const r = run(L);
  assert.equal(r.status, 3, r.out);
  assert.match(r.out, /ALERT_EMAIL_TO/);
  assert.match(r.out, /smtp-password/);
  for (const f of ["smtp-user", "smtp-password", "pg-monitor-password"]) {
    assert.equal(mode(join(L.shared, "monitoring", "secrets", f)), "400", f);
  }
  assert.equal(mode(join(L.shared, "monitoring", "secrets")), "700");
  assert.doesNotMatch(r.log, /compose up/);
  assert.equal(composeLines(join(L.shared, ".env")).length, 0, "COMPOSE_FILE не е пипнат");
}));

test("enable: тайни 400, COMPOSE_FILE пази тома, роля през stdin, стек, /-/ready, цели, таймер за одита", () => withLayout((L) => {
  configured(L, "COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml\n");
  const r = run(L);
  assert.equal(r.status, 0, r.out);
  for (const f of [join(L.shared, ".env"), join(L.app, ".env")]) {
    assert.deepEqual(composeLines(f), ["COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml:docker-compose.monitoring.yml"], f);
  }
  const pw = readFileSync(join(L.shared, "monitoring", "secrets", "pg-monitor-password"), "utf8").trim();
  assert.match(pw, /^[0-9a-f]{64}$/);
  assert.equal(mode(join(L.shared, "monitoring", "secrets", "smtp-password")), "400");
  assert.match(r.log, /chown 65534:65534 .*smtp-password/);
  assert.equal(mode(join(L.shared, "monitoring", "textfile")), "755");
  const sql = readFileSync(L.sql, "utf8");
  assert.match(sql, /CREATE ROLE chatchat_monitor/);
  assert.match(sql, /GRANT pg_monitor TO chatchat_monitor/);
  assert.match(sql, /NOSUPERUSER/);
  assert.doesNotMatch(sql, /\bSUPERUSER\b/, "никога суперпотребител");
  assert.ok(!r.log.includes(pw) && !r.out.includes(pw), "паролата не е в аргументи/изход");
  assert.ok(r.log.indexOf("psql") < r.log.indexOf("compose up -d --no-build\n"), "ролята — преди стека");
  assert.match(r.log, /curl .*127\.0\.0\.1:4390\/-\/ready/);
  assert.match(r.log, /curl .*127\.0\.0\.1:4393\/-\/ready/);
  assert.match(r.out, /заредени правила за аларми: 2/);
  assert.match(r.out, /чете всички 8 цели/);
  assert.ok(existsSync(join(L.systemd, "chatchat-audit-verify.timer")));
  assert.equal(mode(join(L.sbin, "chatchat-audit-verify")), "700");
  assert.match(readFileSync(join(L.systemd, "chatchat-audit-verify.service"), "utf8"), new RegExp(`ReadWritePaths=.*${L.shared}/monitoring/textfile`));
  assert.match(r.log, /systemctl enable --now chatchat-audit-verify\.timer/);
  assert.match(r.log, /systemctl start chatchat-audit-verify\.service/, "първата проверка — веднага");
  assert.match(r.out, /ssh -N -L 4390:127\.0\.0\.1:4390/);
  assert.doesNotMatch(r.out, /xsmtpsib-proba|abc@smtp-brevo/, "тайните не се печатат");

  // Втори пробег: един ред COMPOSE_FILE, същата парола, без нов daemon-reload.
  const again = run(L);
  assert.equal(again.status, 0, again.out);
  assert.equal(composeLines(join(L.shared, ".env")).length, 1);
  assert.equal(readFileSync(join(L.shared, "monitoring", "secrets", "pg-monitor-password"), "utf8").trim(), pw);
  assert.doesNotMatch(again.log, /daemon-reload/);
}));

test("Prometheus не е готов: изход 1; цел не се чете: предупреждение, изход 0", () => withLayout((L) => {
  configured(L);
  const r = run(L, "enable", { READY_RC: "7" });
  assert.equal(r.status, 1);
  assert.match(r.out, /Prometheus не е готов/);
  const d = run(L, "enable", { DOWN: '{"metric":{"job":"postgres","instance":"postgres-exporter:9187"},"value":[1,"0"]}' });
  assert.equal(d.status, 0, d.out);
  assert.match(d.out, /цели, които не се четат: postgres/);
}));

test("не от работещия release: изход 1 (стекът монтира конфига от папката на release-а)", () => withLayout((L) => {
  configured(L);
  writeFileSync(join(L.shared, "last-good"), "/opt/few-few/releases/друг/chatchat\n");
  const r = run(L);
  assert.equal(r.status, 1);
  assert.match(r.out, /не е работещият release/);
  assert.doesNotMatch(r.log, /compose up/);
}));

test("disable: маха само мониторинга от COMPOSE_FILE (томът остава), --remove-orphans", () => withLayout((L) => {
  configured(L, "COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml:docker-compose.monitoring.yml\n");
  const r = run(L, "disable");
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(composeLines(join(L.shared, ".env")), ["COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml"]);
  assert.match(r.log, /compose up -d --no-build --remove-orphans/);
  // Само мониторингът → редът изчезва изцяло.
  configured(L, "COMPOSE_FILE=docker-compose.yml:docker-compose.monitoring.yml\n");
  assert.equal(run(L, "disable").status, 0);
  assert.equal(composeLines(join(L.shared, ".env")).length, 0);
}));

// ── audit-verify.sh: изходът на CLI-то → метрика за textfile collector-а ───────────────────────────
function verify(L, rc, ids = "cid") {
  const stub = `id() { echo 0; }
docker() {
  case "$1" in
    ps) [ -n "$IDS" ] && echo "$IDS" ;;
    exec) echo "exec $*" >> "$LOG"; return "$RC" ;;
  esac
}`;
  const res = spawnSync("bash", ["-c", `source "$SCRIPT"\n${stub}\naudit_verify`], {
    encoding: "utf8",
    env: { ...process.env, SCRIPT: join(L.app, "deploy", "monitoring", "audit-verify.sh"), LOG: L.log,
      CHATCHAT_SHARED: L.shared, RC: String(rc), IDS: ids },
  });
  const dir = join(L.shared, "monitoring", "textfile");
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
  return { status: res.status, out: res.stderr, chain: read("chatchat_audit_chain.prom"), attempt: read("chatchat_audit_verify.prom"), dir };
}

test("audit-verify: цяла → intact 1; счупена → intact 0 и изход 2; незавършена → присъдата не се пипа", () => withLayout((L) => {
  const ok = verify(L, 0);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.chain, /^chatchat_audit_chain_intact 1$/m);
  assert.match(ok.chain, /^chatchat_audit_chain_verified_timestamp_seconds \d{10}$/m);
  assert.match(ok.attempt, /^chatchat_audit_verify_last_run_success 1$/m);
  assert.equal(mode(join(ok.dir, "chatchat_audit_chain.prom")), "644");
  assert.match(readFileSync(L.log, "utf8"), /exec cid node dist\/cli\/audit-verify\.js/);

  const broken = verify(L, 2);
  assert.equal(broken.status, 2);
  assert.match(broken.chain, /^chatchat_audit_chain_intact 0$/m);
  assert.match(broken.out, /СЧУПЕНА/);

  const failed = verify(L, 1);
  assert.equal(failed.status, 1);
  assert.equal(failed.chain, broken.chain, "незавършена проверка не сменя присъдата");
  assert.match(failed.attempt, /^chatchat_audit_verify_last_run_success 0$/m);

  const none = verify(L, 0, "");
  assert.equal(none.status, 1);
  assert.match(none.out, /няма \(точно един\) работещ контейнер/);
}));

// ── compose: валиден с и без файла на мониторинга ──────────────────────────────────────────────────
test("docker compose config: валиден с и без docker-compose.monitoring.yml; само 127.0.0.1", { skip: !hasDocker && "няма docker" }, () => {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME ?? "/root", POSTGRES_PASSWORD: "x", PUBLIC_BASE_URL: "https://chatchat.example.eu",
    SESSION_PEPPER: "p", ATTACHMENT_URL_KEY: "a", MFA_ENC_KEY: "m", FILES_KEK: "k", REDIS_PASSWORD: "0123abcd", MAIL_FROM_EMAIL: "no-reply@example.eu",
    APP_DB_PASSWORD: "a1b2", SYSTEM_DB_PASSWORD: "c3d4" };
  const base = spawnSync("docker", ["compose", "-f", "docker-compose.yml", "config", "-q"], { cwd: cc, env, encoding: "utf8" });
  assert.equal(base.status, 0, base.stderr);
  const full = spawnSync("docker", ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.monitoring.yml", "config", "--format", "json"],
    { cwd: cc, env, encoding: "utf8" });
  assert.equal(full.status, 0, full.stderr);
  const cfg = JSON.parse(full.stdout);
  for (const s of ["prometheus", "alertmanager", "node-exporter", "blackbox", "postgres-exporter"]) {
    const svc = cfg.services[s];
    assert.ok(svc, s);
    assert.match(svc.image, /@sha256:[0-9a-f]{64}$/, `${s}: закован по digest`);
    assert.equal(svc.read_only, true, `${s}: read_only`);
    assert.deepEqual(svc.cap_drop, ["ALL"], `${s}: cap_drop`);
    assert.equal(svc.user, "65534:65534", `${s}: nobody`);
    for (const p of svc.ports ?? []) assert.equal(p.host_ip, "127.0.0.1", `${s}: публикуван само на loopback`);
  }
  assert.equal(cfg.services.app.environment.METRICS_PORT, "9464");
  // Ролите на базата (RLS): приложението и worker-ът — chatchat_app; задачите през клиенти —
  // chatchat_system; собственикът — само за миграциите в entrypoint-а на app (не и в worker-а).
  const app = cfg.services.app.environment;
  const worker = cfg.services.worker.environment;
  assert.match(app.DATABASE_URL, /^postgresql:\/\/chatchat_app:a1b2@db:5432\/chatchat$/);
  assert.match(app.SYSTEM_DATABASE_URL, /^postgresql:\/\/chatchat_system:c3d4@db:5432\/chatchat$/);
  assert.match(app.MIGRATE_DATABASE_URL, /^postgresql:\/\/chatchat:x@db:5432\/chatchat$/);
  assert.match(worker.DATABASE_URL, /^postgresql:\/\/chatchat_app:/);
  assert.match(worker.SYSTEM_DATABASE_URL, /^postgresql:\/\/chatchat_system:/);
  assert.equal(worker.MIGRATE_DATABASE_URL, undefined, "worker-ът не мигрира — без адреса на собственика");
  const missing = spawnSync("docker", ["compose", "-f", "docker-compose.yml", "config", "-q"],
    { cwd: cc, env: { ...env, APP_DB_PASSWORD: "" }, encoding: "utf8" });
  assert.notEqual(missing.status, 0, "без APP_DB_PASSWORD compose отказва");
  assert.equal(cfg.services.alertmanager.environment.ALERT_EMAIL_FROM, "no-reply@example.eu", "подателят пада към MAIL_FROM_EMAIL");
  assert.deepEqual(Object.keys(cfg.services["node-exporter"].networks), ["monitoring"], "node-exporter — без път навън");
  assert.equal(cfg.networks.monitoring.internal, true);
});
