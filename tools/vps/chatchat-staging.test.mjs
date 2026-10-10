// chatchat-staging.test.mjs — staging на ChatChat (chatchat/deploy/staging.sh → deploy.sh), пуснат ИСТИНСКИ
// (bash) върху временна файлова система. docker, curl, ss, nginx и systemctl са ФАЛШИВИ изпълними файлове в
// PATH, които пишат в дневник какво са извикани (и с кой COMPOSE_PROJECT_NAME). Проверява се главното:
// staging не пипа пътищата/томовете/портовете на продукцията; оценката е гейт; откатът на място работи.
// Плюс: `docker compose -p chatchat-staging config` е валиден и `nginx -t` на vhost-а в контейнер (ако има
// docker и образ nginx локално — иначе тези два теста се пропускат с причина).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const isRoot = process.getuid?.() === 0;
const mode = (p) => (statSync(p).mode & 0o777).toString(8);

const FAKE_DOCKER = `#!/usr/bin/env bash
S="$FAKE_STATE"
printf 'docker[%s] %s\\n' "\${COMPOSE_PROJECT_NAME:-}" "$*" >> "$LOG"
case "$*" in
  "compose version") exit 0 ;;
  "volume inspect "*) grep -qx "$3" "$S/volumes" 2>/dev/null; exit $? ;;
  "compose config --images") printf '%s\\n' app 'pgvector/pgvector:0.8.7-pg16@sha256:aa'; exit 0 ;;
  "image inspect"*) exit 0 ;;
  "compose build app") exit "\${BUILD_RC:-0}" ;;
  "compose up -d --remove-orphans") exit "\${UP_RC:-0}" ;;
  "compose up"*) exit 0 ;;
  "compose exec -T db pg_dump"*) echo "-- dump"; exit 0 ;;
  *pg_database*) [ -f "$S/evaldb" ] && echo 1; exit 0 ;;
  *"CREATE DATABASE"*) touch "$S/evaldb"; exit 0 ;;
  "compose exec -T db psql"*) echo 1; exit 0 ;;
  "compose ps -q clamav") echo clamcid; exit 0 ;;
  "inspect -f {{.State.Health.Status}} clamcid") echo healthy; exit 0 ;;
  "build "*) exit "\${EVAL_BUILD_RC:-0}" ;;
  "network ls"*backend*) echo net-backend; exit 0 ;;
  "network ls"*default*) echo net-default; exit 0 ;;
  "create "*)
    printf '%s\\n' "\${DATABASE_URL:-}" > "$S/create-dburl"
    prev=""
    for a in "$@"; do
      if [ "$prev" = -v ]; then case "$a" in *:/reports) printf '%s' "\${a%:/reports}" > "$S/reports" ;; esac; fi
      prev="$a"
    done
    echo evalcid; exit 0 ;;
  "start -a evalcid")
    echo "eval: отчет"
    r="$(cat "$S/reports")"
    if [ "\${EVAL_REPORT:-1}" = 1 ]; then echo '{"metrics":{}}' > "$r/sample-x.json"; echo '#' > "$r/sample-x.md"; fi
    exit "\${EVAL_RC:-0}" ;;
  "inspect -f {{.State.ExitCode}} evalcid") echo "\${EVAL_RC:-0}"; exit 0 ;;
  "inspect -f {{.State.Running}} evalcid") echo false; exit 0 ;;
esac
exit 0
`;
const FAKES = {
  docker: FAKE_DOCKER,
  curl: `#!/usr/bin/env bash\necho "curl \${*: -1}" >> "$LOG"\nprintf '%s' "$HEALTH_BODY"\n`,
  ss: `#!/usr/bin/env bash\nfor p in \${BUSY_PORTS:-}; do case "$*" in *":$p") echo "LISTEN 0 4096 127.0.0.1:$p 0.0.0.0:*" ;; esac; done\n`,
  nginx: `#!/usr/bin/env bash\necho "nginx $*" >> "$LOG"\n`,
  systemctl: `#!/usr/bin/env bash\necho "systemctl $*" >> "$LOG"\n`,
};

function layout() {
  const base = mkdtempSync(join(tmpdir(), "chatchat-staging-"));
  const L = {
    base, bin: join(base, "bin"), state: join(base, "state"), log: join(base, "log.txt"),
    rel: join(base, "releases", "r1", "few-few", "chatchat"),
    prod: join(base, "shared", "chatchat"), stg: join(base, "shared", "chatchat-staging"),
    access: join(base, "etc", "nginx", "chatchat-staging"), sites: join(base, "etc", "nginx", "sites-available"),
    enabled: join(base, "etc", "nginx", "sites-enabled"), le: join(base, "le"), logs: join(base, "var-log"),
  };
  for (const d of [L.bin, L.state, L.sites, L.enabled]) mkdirSync(d, { recursive: true });
  for (const [n, body] of Object.entries(FAKES)) {
    writeFileSync(join(L.bin, n), body);
    chmodSync(join(L.bin, n), 0o755);
  }
  // Release-ът: истинските chatchat/deploy, docker-compose.yml и Dockerfile от репото.
  mkdirSync(L.rel, { recursive: true });
  cpSync(join(root, "chatchat", "deploy"), join(L.rel, "deploy"), { recursive: true });
  for (const f of ["docker-compose.yml", "Dockerfile"]) cpSync(join(root, "chatchat", f), join(L.rel, f));
  // Продукцията: тайните ѝ и .env в папката на release-а (разгъната е от същия архив).
  mkdirSync(L.prod, { recursive: true, mode: 0o700 });
  const prodEnv = "PUBLIC_BASE_URL=https://chatchat.carbonstealth.eu\nPOSTGRES_PASSWORD=prodpw1234\nSESSION_PEPPER=prodpepper\nFILES_KEK=prodkek\n";
  writeFileSync(join(L.prod, ".env"), prodEnv, { mode: 0o600 });
  writeFileSync(join(L.rel, ".env"), prodEnv, { mode: 0o600 });
  return L;
}
const withLayout = (body) => {
  const L = layout();
  try { body(L); } finally { rmSync(L.base, { recursive: true, force: true }); }
};

function staging(L, env = {}, script = join(L.rel, "deploy", "staging.sh")) {
  const res = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env, PATH: `${L.bin}:${process.env.PATH}`, LOG: L.log, FAKE_STATE: L.state,
      HEALTH_BODY: '{"ok":true,"app":"chatchat","ai":false}',
      CHATCHAT_STAGING_SHARED: L.stg, CHATCHAT_PROD_SHARED: L.prod, CHATCHAT_STAGING_ACCESS_DIR: L.access,
      CHATCHAT_STAGING_NGINX_SITE: join(L.sites, "chatchat-staging"), CHATCHAT_STAGING_NGINX_LINK: join(L.enabled, "chatchat-staging"),
      CHATCHAT_LE_DIR: L.le, CHATCHAT_LOG_DIR: L.logs, CHATCHAT_HEALTH_WAIT: "0", ...env,
    },
  });
  const log = existsSync(L.log) ? readFileSync(L.log, "utf8") : "";
  writeFileSync(L.log, "");
  return { status: res.status, out: res.stdout + res.stderr, log };
}

// Отпечатък на дърво: път → права + съдържание (за „нищо не е пипнато“).
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const st = statSync(p);
      out[p] = `${(st.mode & 0o7777).toString(8)} ${st.uid}:${st.gid} ` +
        (st.isDirectory() ? "dir" : createHash("sha256").update(readFileSync(p)).digest("hex"));
      if (st.isDirectory()) walk(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}
const envOf = (L) => readFileSync(join(L.stg, ".env"), "utf8");
const copies = (L) => (existsSync(join(L.stg, "releases")) ? readdirSync(join(L.stg, "releases")).sort() : []);

test("пръв деплой: .env се ражда (600, собствени ключове), всичко е проект chatchat-staging, продукцията е непокътната", { skip: !isRoot && "иска root (chown 1000)" }, () => withLayout((L) => {
  const prodBefore = snapshot(L.prod);
  const relEnvBefore = readFileSync(join(L.rel, ".env"), "utf8");
  const r = staging(L);
  assert.equal(r.status, 0, r.out);

  const env = envOf(L);
  assert.equal(mode(join(L.stg, ".env")), "600");
  assert.match(env, /^COMPOSE_PROJECT_NAME=chatchat-staging$/m);
  assert.match(env, new RegExp(`^CHATCHAT_SHARED=${L.stg}$`, "m"));
  assert.match(env, /^HTTP_PORT=4331$/m);
  assert.match(env, /^PUBLIC_BASE_URL=https:\/\/staging-chatchat\.carbonstealth\.eu$/m);
  assert.match(env, /^POSTGRES_PASSWORD=[0-9a-f]{64}$/m);
  assert.match(env, /^SESSION_PEPPER=[0-9a-f]{64}$/m);
  assert.match(env, /^FILES_KEK=\S{40,}$/m, "deploy.sh ражда и останалите ключове — в .env на staging");
  assert.doesNotMatch(env, /prodpw1234|prodpepper|prodkek/, "нито една тайна на продукцията");
  assert.doesNotMatch(r.out + r.log, /POSTGRES_PASSWORD=|SESSION_PEPPER=|FILES_KEK=/, "стойностите не се печатат");

  // Продукцията: папката, .env в release-а — байт по байт същите.
  assert.deepEqual(snapshot(L.prod), prodBefore);
  assert.equal(readFileSync(join(L.rel, ".env"), "utf8"), relEnvBefore, ".env на продукцията в release-а не е пипнат");

  // Работното копие: отделна папка, с .env на staging (не на продукцията).
  const [copy] = copies(L);
  assert.ok(copy, "има работно копие");
  const app = join(L.stg, "releases", copy);
  assert.equal(readFileSync(join(app, ".env"), "utf8"), env);
  assert.equal(readFileSync(join(L.stg, "last-good"), "utf8").trim(), app);
  assert.equal(readFileSync(join(L.stg, "last-attempt"), "utf8").trim(), app);

  // Всяка compose команда е към chatchat-staging; томът е неговият; никога `chatchat_*`.
  const compose = r.log.split("\n").filter((l) => /^docker\[[^\]]*\] compose (?!version)/.test(l));
  assert.ok(compose.length > 5, r.log);
  for (const l of compose) assert.match(l, /^docker\[chatchat-staging\] /, l);
  assert.match(r.log, /volume inspect chatchat-staging_db-data/);
  assert.doesNotMatch(r.log, /chatchat_db-data/);
  assert.match(r.log, /curl http:\/\/127\.0\.0\.1:4331\/readyz/, "сондата е на порта на staging");
  assert.doesNotMatch(r.log, /4330/);

  // Без таймерите на продукцията (unit-ите им са с фиксирани имена) и без подсказка за шифрования том.
  assert.doesNotMatch(r.log, /chatchat-backup|chatchat-retention/);
  assert.doesNotMatch(r.out, /pgdata-encrypt/);

  // Папките на staging; достъпът на nginx — файлът, който vhost-ът включва.
  assert.equal(mode(join(L.stg, "attachments")), "700");
  assert.equal(statSync(join(L.stg, "attachments")).uid, 1000);
  assert.equal(mode(join(L.stg, "eval-reports")), "755");
  assert.ok(existsSync(join(L.access, "allow.conf")));
  assert.match(r.out, /затворен за всички/, "без htpasswd и allowlist — казва, че е затворен");

  // Оценката: build стадий, тестовата база, контейнер в мрежата на staging, отчетът в eval-reports.
  assert.match(r.log, /build -q --target build -t chatchat-staging-eval:latest/);
  assert.match(r.log, /CREATE DATABASE chatchat_eval_test/);
  const create = r.log.split("\n").find((l) => / create /.test(l)) ?? "";
  for (const want of ["--network net-backend", "--read-only", "--cap-drop ALL", "--user 1000:1000", "no-new-privileges:true", "-e EVAL_FLAG=--fake"]) {
    assert.ok(create.includes(want), `${want}\n${create}`);
  }
  assert.doesNotMatch(create, /net-default/, "fake: само вътрешната мрежа");
  const dbUrl = readFileSync(join(L.state, "create-dburl"), "utf8").trim();
  assert.match(dbUrl, /^postgresql:\/\/chatchat:[0-9a-f]{64}@db:5432\/chatchat_eval_test$/, "отделната тестова база");
  const pw = env.match(/^POSTGRES_PASSWORD=(\S+)$/m)[1];
  assert.ok(!r.log.includes(pw) && !r.out.includes(pw), "паролата не е в argv/дневника");
  assert.deepEqual(readdirSync(join(L.stg, "eval-reports")), ["sample-x.json"]);
  assert.equal(mode(join(L.stg, "eval-reports", "sample-x.json")), "644");
  assert.match(readFileSync(join(L.logs, "staging-eval.log"), "utf8"), /eval: отчет/);
}));

test("втори деплой: тестовата база вече я има — не се създава пак; има бекъп преди миграцията", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  assert.equal(staging(L).status, 0);
  writeFileSync(join(L.state, "volumes"), "chatchat-staging_db-data\n");
  const r = staging(L);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.log, /CREATE DATABASE/);
  assert.match(r.log, /docker\[chatchat-staging\] compose exec -T db pg_dump/);
  assert.equal(readdirSync(join(L.stg, "backups")).filter((f) => f.startsWith("pre-deploy-")).length, 1);
  assert.ok(!existsSync(join(L.prod, "backups")), "бекъпът е в папката на staging");
}));

test("червена оценка (нарушение на безопасността): изход 5, last-good остава, отчетът е запазен", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  assert.equal(staging(L).status, 0);
  const good = readFileSync(join(L.stg, "last-good"), "utf8");
  const r = staging(L, { EVAL_RC: "1" });
  assert.equal(r.status, 5, r.out);
  assert.match(r.out, /ОЦЕНКАТА Е ЧЕРВЕНА/);
  assert.equal(readFileSync(join(L.stg, "last-good"), "utf8"), good, "last-good не се мести");
  assert.notEqual(readFileSync(join(L.stg, "last-attempt"), "utf8"), good);
  assert.ok(readdirSync(join(L.stg, "eval-reports")).includes("sample-x.json"), "червеният отчет също е за преглед");
}));

test("оценката не остави отчет / образът не се построи: изход 5", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  assert.equal(staging(L, { EVAL_BUILD_RC: "1" }).status, 5);
  assert.ok(!existsSync(join(L.stg, "last-good")));
}));

test("сондата не вижда ChatChat: изход 4 (за отката на autodeploy), без оценка", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  const r = staging(L, { HEALTH_BODY: '{"ok":true}' });
  assert.equal(r.status, 4, r.out);
  assert.doesNotMatch(r.log, / create /);
  assert.ok(!existsSync(join(L.stg, "last-good")));
}));

test("откат на място: staging.sh от работното копие не прави ново копие и не пуска оценката", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  assert.equal(staging(L).status, 0);
  const [copy] = copies(L);
  const app = join(L.stg, "releases", copy);
  writeFileSync(join(L.state, "volumes"), "chatchat-staging_db-data\n");
  const r = staging(L, { CHATCHAT_SKIP_BACKUP: "1", STAGING_SKIP_EVAL: "1" }, join(app, "deploy", "staging.sh"));
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(copies(L), [copy], "без ново копие");
  assert.doesNotMatch(r.log, / create |pg_dump/);
  assert.equal(readFileSync(join(L.stg, "last-good"), "utf8").trim(), app);
}));

// ── Пазачите: всеки отказ е ПРЕДИ build (изход 1) ────────────────────────────────────────────────────
const guards = [
  ["тайна, споделена с продукцията", "POSTGRES_PASSWORD=prodpw1234\n", /тайните на продукцията: POSTGRES_PASSWORD/],
  ["портът на продукцията", "HTTP_PORT=4330\n", /портът на продукцията/],
  ["адресът на продукцията", "PUBLIC_BASE_URL=https://chatchat.carbonstealth.eu\n", /адресът на продукцията/],
  ["папката на продукцията в CHATCHAT_SHARED", "CHATCHAT_SHARED=__PROD__\n", /трябва да е/],
  ["проектът на продукцията", "COMPOSE_PROJECT_NAME=chatchat\n", /staging е само chatchat-staging/],
  ["шифрованият том на продукцията", "COMPOSE_FILE=docker-compose.yml:docker-compose.pgdata.yml\n", /COMPOSE_FILE/],
];
for (const [name, line, msg] of guards) {
  test(`пазач: ${name} → изход 1, нищо не е построено`, { skip: !isRoot && "иска root" }, () => withLayout((L) => {
    mkdirSync(L.stg, { recursive: true });
    const base = "PUBLIC_BASE_URL=https://staging-chatchat.carbonstealth.eu\nPOSTGRES_PASSWORD=stgpw\nSESSION_PEPPER=stgpep\n";
    writeFileSync(join(L.stg, ".env"), base + line.replace("__PROD__", L.prod), { mode: 0o600 });
    const prodBefore = snapshot(L.prod);
    const r = staging(L);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, msg);
    assert.doesNotMatch(r.log, /compose build|compose up/);
    assert.doesNotMatch(r.out, /prodpw1234/, "стойността не се печата");
    assert.deepEqual(snapshot(L.prod), prodBefore);
  }));
}

test("пазач: портът на staging е зает от друго приложение → изход 1 преди build", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  const r = staging(L, { BUSY_PORTS: "4331" });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /порт 4331 е зает/);
  assert.doesNotMatch(r.log, /compose build/);
}));

test("изгубен .env при съществуващ том на staging: отказ, паролата не се измисля", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  writeFileSync(join(L.state, "volumes"), "chatchat-staging_db-data\n");
  const r = staging(L);
  assert.equal(r.status, 1, r.out);
  assert.ok(!existsSync(join(L.stg, ".env")));
}));

test("със сертификат: vhost-ът на staging (4331, noindex, достъп) отива на своя път, на продукцията — нищо", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  const live = join(L.le, "live", "staging-chatchat.carbonstealth.eu");
  mkdirSync(live, { recursive: true });
  writeFileSync(join(live, "fullchain.pem"), "x");
  const r = staging(L);
  assert.equal(r.status, 0, r.out);
  const site = readFileSync(join(L.sites, "chatchat-staging"), "utf8");
  assert.match(site, /proxy_pass http:\/\/127\.0\.0\.1:4331;/);
  assert.doesNotMatch(site, /127\.0\.0\.1:4330/);
  assert.match(site, /X-Robots-Tag "noindex/);
  assert.match(site, /auth_basic_user_file/);
  assert.deepEqual(readdirSync(L.sites), ["chatchat-staging"], "само файлът на staging");
  assert.match(r.log, /nginx -t/);
  assert.match(r.log, /systemctl reload nginx/);
}));

test("работните копия се чистят: последните 3 + last-good", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  mkdirSync(join(L.stg, "releases"), { recursive: true });
  for (const n of ["20260101-000001", "20260101-000002", "20260101-000003", "20260101-000004"]) {
    mkdirSync(join(L.stg, "releases", n));
    spawnSync("touch", ["-d", `2026-01-0${n.at(-1)}`, join(L.stg, "releases", n)]);
  }
  writeFileSync(join(L.stg, "last-good"), `${join(L.stg, "releases", "20260101-000001")}\n`);
  assert.equal(staging(L, { EVAL_RC: "0" }).status, 0);
  const left = copies(L);
  assert.equal(left.length, 3, left.join(","));
  assert.ok(!left.includes("20260101-000001") && !left.includes("20260101-000002"), left.join(","));
}));

// ── deploy.sh в режим продукция: пазачът срещу чужд проект ──────────────────────────────────────────
test("продукция: .env с COMPOSE_PROJECT_NAME на staging → изход 1 преди build; наследен COMPOSE_PROJECT_NAME не важи", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  const run = (env) => {
    const res = spawnSync("bash", [join(L.rel, "deploy", "deploy.sh")], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${L.bin}:${process.env.PATH}`, LOG: L.log, FAKE_STATE: L.state,
        HEALTH_BODY: '{"ok":true,"ai":false}', CHATCHAT_SHARED: L.prod, CHATCHAT_LE_DIR: L.le, CHATCHAT_HEALTH_WAIT: "0",
        CHATCHAT_SYSTEMD_DIR: join(L.base, "systemd"), CHATCHAT_SBIN: join(L.base, "sbin"), CHATCHAT_AGE: "true",
        CHATCHAT_PGDATA_CONF_DIR: join(L.base, "nope"), ...env },
    });
    const log = readFileSync(L.log, "utf8");
    writeFileSync(L.log, "");
    return { status: res.status, out: res.stdout + res.stderr, log };
  };
  mkdirSync(join(L.base, "systemd"));
  writeFileSync(join(L.prod, ".env"), readFileSync(join(L.prod, ".env"), "utf8") + "COMPOSE_PROJECT_NAME=chatchat-staging\n");
  const bad = run({});
  assert.equal(bad.status, 1, bad.out);
  assert.match(bad.out, /не е \.env на продукцията/);
  assert.doesNotMatch(bad.log, /compose build/);

  writeFileSync(join(L.prod, ".env"), "PUBLIC_BASE_URL=https://chatchat.carbonstealth.eu\nPOSTGRES_PASSWORD=prodpw1234\nSESSION_PEPPER=p\n");
  const ok = run({ COMPOSE_PROJECT_NAME: "chatchat-staging" });
  assert.equal(ok.status, 0, ok.out);
  for (const l of ok.log.split("\n").filter((x) => x.startsWith("docker["))) assert.match(l, /^docker\[\] /, l);
  assert.match(ok.log, /volume inspect chatchat_db-data/);
}));

test("deploy.sh: CHATCHAT_STAGING=1 без проекта chatchat-staging → изход 1 преди build", { skip: !isRoot && "иска root" }, () => withLayout((L) => {
  mkdirSync(L.stg, { recursive: true });
  writeFileSync(join(L.stg, ".env"), "PUBLIC_BASE_URL=https://x\nPOSTGRES_PASSWORD=a\nSESSION_PEPPER=b\nCOMPOSE_PROJECT_NAME=chatchat\n");
  const res = spawnSync("bash", [join(L.rel, "deploy", "deploy.sh")], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${L.bin}:${process.env.PATH}`, LOG: L.log, FAKE_STATE: L.state,
      CHATCHAT_SHARED: L.stg, CHATCHAT_STAGING: "1", COMPOSE_PROJECT_NAME: "chatchat" },
  });
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.doesNotMatch(readFileSync(L.log, "utf8"), /compose build/);
}));

// ── Истински docker (по избор): compose config и nginx -t ───────────────────────────────────────────
const dockerOk = spawnSync("docker", ["compose", "version"], { encoding: "utf8" }).status === 0;

test("docker compose -p chatchat-staging config: валиден, своите томове/порт/папки, нищо от продукцията", { skip: !dockerOk && "няма docker compose" }, () => withLayout((L) => {
  const envFile = join(L.base, "staging.env");
  writeFileSync(envFile, [
    "COMPOSE_PROJECT_NAME=chatchat-staging", `CHATCHAT_SHARED=${L.stg}`, "HTTP_PORT=4331",
    "PUBLIC_BASE_URL=https://staging-chatchat.carbonstealth.eu", "POSTGRES_PASSWORD=aa", "SESSION_PEPPER=bb",
    "ATTACHMENT_URL_KEY=cc", "MFA_ENC_KEY=dd", "FILES_KEK=ee", "REDIS_PASSWORD=0123abcd",
    "APP_DB_PASSWORD=ff01", "SYSTEM_DB_PASSWORD=ff02", "",
  ].join("\n"));
  for (const args of [["-p", "chatchat-staging"], []]) {
    const res = spawnSync("docker", ["compose", ...args, "--env-file", envFile, "-f", join(root, "chatchat", "docker-compose.yml"), "config", "--format", "json"], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    const cfg = JSON.parse(res.stdout);
    assert.equal(cfg.name, "chatchat-staging", "и от .env (ръчните команди от копието), и с -p");
    assert.deepEqual(Object.values(cfg.volumes).map((v) => v.name).sort(), ["chatchat-staging_clamav-db", "chatchat-staging_db-data", "chatchat-staging_redis-data"]);
    const ports = cfg.services.app.ports.map((p) => `${p.host_ip}:${p.published}:${p.target}`);
    assert.ok(ports.includes("127.0.0.1:4331:4330"), ports.join(","));
    for (const p of cfg.services.app.ports) assert.equal(p.host_ip, "127.0.0.1", "само loopback");
    const binds = [...cfg.services.app.volumes, ...cfg.services.clamav.volumes].filter((v) => v.type === "bind").map((v) => v.source);
    for (const b of binds.filter((x) => x !== "/dev/null")) assert.ok(b.startsWith(L.stg), b);
    assert.doesNotMatch(res.stdout, /\/opt\/few-few\/shared\/chatchat[/"]/);
    assert.ok(cfg.services.app.environment.DATABASE_URL.endsWith("@db:5432/chatchat"), "базата на staging е в неговия контейнер db");
    assert.ok(cfg.services.app.environment.DATABASE_URL.startsWith("postgresql://chatchat_app:ff01@"), "staging — също под RLS");
  }
}));

const nginxImage = dockerOk && spawnSync("docker", ["image", "inspect", "nginx:stable"], { encoding: "utf8" }).status === 0;

test("nginx -t на vhost-а на staging в контейнер + достъп: 401 без парола, noindex, /readyz затворен", { skip: !nginxImage && "няма локален образ nginx:stable" }, () => withLayout((L) => {
  const le = join(L.base, "le-live");
  mkdirSync(le, { recursive: true });
  const ssl = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=staging-chatchat.carbonstealth.eu",
    "-keyout", join(le, "privkey.pem"), "-out", join(le, "fullchain.pem")], { encoding: "utf8" });
  assert.equal(ssl.status, 0, ssl.stderr);
  mkdirSync(L.access, { recursive: true });
  writeFileSync(join(L.access, "allow.conf"), "# празно\n");
  const hash = spawnSync("openssl", ["passwd", "-6", "proba-parola"], { encoding: "utf8" }).stdout.trim();
  writeFileSync(join(L.access, "htpasswd"), `qa:${hash}\n`);
  for (const f of ["allow.conf", "htpasswd"]) chmodSync(join(L.access, f), 0o644);
  chmodSync(L.access, 0o755);
  // Продукционният vhost до него — двата заедно трябва да минат `nginx -t` (общи зони, имена).
  const vhosts = join(L.base, "conf.d");
  mkdirSync(vhosts);
  // Контейнерът тук е без IPv6 (`socket() [::]:80 failed (97)`) — само тези редове падат; останалото е 1:1.
  const v4 = (f) => readFileSync(join(root, "chatchat", "deploy", "nginx", f), "utf8").replace(/^\s*listen \[::\]:.*$/gm, "");
  writeFileSync(join(vhosts, "staging.conf"), v4("staging-chatchat.carbonstealth.eu.conf"));
  writeFileSync(join(vhosts, "prod.conf"), v4("chatchat.carbonstealth.eu.conf"));
  const mounts = ["-v", `${vhosts}:/etc/nginx/conf.d:ro`, "-v", `${L.access}:/etc/nginx/chatchat-staging:ro`,
    "-v", `${le}:/etc/letsencrypt/live/staging-chatchat.carbonstealth.eu:ro`, "-v", `${le}:/etc/letsencrypt/live/chatchat.carbonstealth.eu:ro`];
  const t = spawnSync("docker", ["run", "--rm", ...mounts, "nginx:stable", "nginx", "-t"], { encoding: "utf8" });
  assert.equal(t.status, 0, t.stderr);
  assert.match(t.stderr, /test is successful/);

  // На живо: nginx в контейнера, curl отвън (--resolve — истинското име, без DNS).
  const name = `chatchat-staging-nginx-${process.pid}`;
  const up = spawnSync("docker", ["run", "-d", "--name", name, "-p", "127.0.0.1::443", ...mounts, "nginx:stable"], { encoding: "utf8" });
  assert.equal(up.status, 0, up.stderr);
  try {
    const port = spawnSync("docker", ["port", name, "443/tcp"], { encoding: "utf8" }).stdout.trim().split(":").pop();
    const curl = (path, extra = []) => {
      for (let i = 0; i < 20; i++) {
        const r = spawnSync("curl", ["-sk", "-o", "/dev/null", "-D", "-", "--noproxy", "*", "--resolve", `staging-chatchat.carbonstealth.eu:${port}:127.0.0.1`,
          ...extra, `https://staging-chatchat.carbonstealth.eu:${port}${path}`], { encoding: "utf8" });
        if (r.status === 0 && r.stdout) return r.stdout;
        spawnSync("sleep", ["0.25"]);
      }
      return "";
    };
    const anon = curl("/");
    assert.match(anon, /^HTTP\/[\d.]+ 401/m, anon);
    assert.match(anon, /^x-robots-tag: noindex, nofollow, noarchive/im, "noindex и на 401");
    assert.match(anon, /^www-authenticate: Basic/im);
    const wrong = curl("/", ["-u", "qa:greshna"]);
    assert.match(wrong, /^HTTP\/[\d.]+ 401/m);
    // Вярната парола минава достъпа → nginx стига до upstream-а (в контейнера няма приложение → 502).
    const right = curl("/", ["-u", "qa:proba-parola"]);
    assert.match(right, /^HTTP\/[\d.]+ 502/m, right);
    assert.match(right, /^x-robots-tag: noindex/im);
    // /readyz: само от самия сървър — и с парола е 403 отвън.
    assert.match(curl("/readyz", ["-u", "qa:proba-parola"]), /^HTTP\/[\d.]+ 403/m);
    // Без htpasswd (собственикът още не го е направил) — отказ (nginx дава 403), никога пропуснато към приложението.
    rmSync(join(L.access, "htpasswd"));
    const none = curl("/", ["-u", "qa:proba-parola"]);
    assert.match(none, /^HTTP\/[\d.]+ (403|500)/m, none);
  } finally {
    spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
  }
}));

test("vhost-ът на staging пази маршрутите и таваните на продукцията (синхрон)", () => {
  const read = (f) => readFileSync(join(root, "chatchat", "deploy", "nginx", f), "utf8");
  const shape = (s) => [...s.matchAll(/^\s*(location [^{]+|client_max_body_size \S+|proxy_read_timeout \S+|proxy_buffering \S+)/gm)].map((m) => m[1].trim());
  assert.deepEqual(shape(read("staging-chatchat.carbonstealth.eu.conf")), shape(read("chatchat.carbonstealth.eu.conf")));
  const stg = read("staging-chatchat.carbonstealth.eu.conf");
  assert.doesNotMatch(stg, /127\.0\.0\.1:4330/, "staging никога не сочи порта на продукцията");
  assert.doesNotMatch(stg.replace(/^\s*#.*$/gm, ""), /includeSubDomains/, "HSTS само за хоста на staging");
  assert.match(stg, /satisfy any;[\s\S]*include \/etc\/nginx\/chatchat-staging\/allow\.conf;[\s\S]*deny all;[\s\S]*auth_basic_user_file/);
});
