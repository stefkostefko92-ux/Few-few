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
  // Трети преглед: помощник с образ postgres и анонимен VOLUME (zabobovdol-backup) НЕ е база —
  // база е само контейнер, чиято команда е самият сървър `postgres`.
  assert.match(src, /index \.Config\.Cmd 0/, "решението е по командата на контейнера");
  assert.doesNotMatch(src, /grep -q '\^\/var\/lib\/postgresql'/, "не по наличието на том (анонимният VOLUME на образа лъже)");
  assert.match(src, /pgdown\) fail "Postgres \$c/, "и дава fail, не тишина");
  assert.doesNotMatch(src.match(/case "\$\{CKIND\[\$c\]\}" in ([a-z|]+)\) if/)[1], /pgdown/, "томът ѝ не се пропуска");
});

test("нощните дъмпове и пробното възстановяване проверяват свободното място", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /MODE" = dumps \] && \[ "\$FORCE" != 1 \]/, "dumps: проверка на свободното място");
  assert.match(src, /\[ "\$FREE" -lt "\$NEED_KB" \]/, "dumps: минимумът е част от нужното");
  const off = readFileSync(join(here, "offsite-backup.sh"), "utf8");
  assert.match(off, /df -Pk "\$VERIFY_TMP"/, "verify сверява свободното място преди restore");
});

test("изчезнал контейнер/том по време на бекъпа не убива нощното копие; /var/backups пази правата си", () => {
  const src = readFileSync(script, "utf8");
  const loop = src.slice(src.indexOf('while IFS= read -r c; do'), src.indexOf('# Папката на compose проекта'));
  assert.ok(loop.indexOf("CONTAINERS+=") > loop.indexOf("CRUN[$c]="), "името влиза в списъка едва след успешен inspect");
  assert.match(src, /docker inspect "\$\{CONTAINERS\[@\]\}" > "\$STAGE\/docker\/inspect\.json" 2>"\$ERR" \|\| warn/, "общият inspect не е фатален");
  const vols = src.match(/mp="\$\(docker volume inspect -f '\{\{\.Mountpoint\}\}' "\$v"[^\n]*/g) || [];
  assert.ok(vols.length >= 2 && vols.every((l) => /\|\|/.test(l)), "всеки volume inspect има резервен път");
  assert.doesNotMatch(src, /^\s*install -d -m 700 "\$\(dirname "\$DUMP_TO"\)"$/m, "не сменя правата на съществуваща /var/backups");
});

// Четвърти преглед на PR #312 (Кодаджията, CWE-214): offsite-backup.sh експортва RESTIC_*/AWS_*/B2_*…,
// а migrate-backup.sh вика `runuser -u postgres` без чиста среда → ключовете стоят в /proc/<pid>/environ
// на процес с uid postgres (четим от SQL суперпотребител). Два слоя: migrate тръгва без тях, а всяко
// runuser към postgres — с env -i.
test("тайните на offsite не стигат до процесите на postgres", () => {
  const src = readFileSync(script, "utf8");
  assert.doesNotMatch(src, /runuser -u postgres -- (?!env -i )/, "всяко runuser към postgres е с env -i");
  const off = readFileSync(join(here, "offsite-backup.sh"), "utf8");
  const call = off.split("\n").find((l) => /bash "\$MIGRATE"/.test(l));
  assert.ok(call, "извикването на migrate-backup.sh");
  assert.match(call, /unset/, "migrate-backup.sh тръгва без RESTIC_*/AWS_*/… в средата");
});

// Четвърти преглед на PR #312 (VPS-аджията): SQLite в Docker том (scuolabulgara qb-data, Uptime Kuma)
// и в bind извън корените влизаше само сурово — търсенето пропуска /var/lib/docker. Сега томовете и
// bind-овете са начални точки на търсенето (find стартира ВЪТРЕ в тях, -prune не ги хваща).
test("SQLite в Docker томове и външни bind-ове минава през backup API", () => {
  const src = readFileSync(script, "utf8");
  const line = src.split("\n").find((l) => /SQL_DIRS\+=\("\$r"\)/.test(l));
  assert.ok(line, "редът, който пълни SQL_DIRS");
  assert.match(line, /INC_VOLS\[@\]/, "томовете влизат в търсенето");
  assert.match(line, /EXTRA_BINDS\[@\]/, "външните bind-ове също");
});

// Пети преглед на PR #312 (VPS-аджията, средна · Сигурно): DUMP_TO се преименува на .old и се трие с
// rm -rf, а проверката беше само „поне две нива навътре“ — DUMP_TO=/opt/medqr би изтрил продукта.
// Сега чужда папка (без нашия маркер) на DUMP_TO, .new или .old спира скрипта ПРЕДИ всякаква работа.
test("DUMP_TO: чужда папка без маркер не се трие — скриптът отказва", { skip: !isRoot && "иска root" }, () => {
  const t = mkdtempSync(join(tmpdir(), "mb-"));
  for (const suffix of ["", ".old", ".new"]) {
    const dump = join(t, "app", "dumps");
    rmSync(join(t, "app"), { recursive: true, force: true });
    mkdirSync(dump + suffix, { recursive: true });
    writeFileSync(join(dump + suffix, "ценно.txt"), "не е наш бекъп");
    const r = spawnSync("bash", [script], { encoding: "utf8", env: { ...process.env, DUMP_TO: dump, OUT_DIR: join(t, "o") } });
    assert.equal(r.status, 1, `DUMP_TO${suffix}: ${r.stderr}`);
    assert.match(r.stderr, /маркер/, `DUMP_TO${suffix}: причината е назована`);
    assert.ok(existsSync(join(dump + suffix, "ценно.txt")), `DUMP_TO${suffix}: файлът е непокътнат`);
  }
  rmSync(t, { recursive: true, force: true });
});

test("DUMP_TO: новият бекъп носи маркер; старият формат (paths.txt + inventory.txt) се приема", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /: > "\$STAGE\/\.migrate-backup-dumps"/, "маркерът се пише в STAGE преди преместването");
  assert.match(src, /paths\.txt" \] && \[ -f "\$1\/inventory\.txt"/, "папка от предишна версия без маркер още е наша");
});

// Пети преглед (VPS-аджията, средна · Вероятно): в пика на диска стоят и старият DUMP_TO, и новият STAGE.
test("нощните дъмпове искат място за стария бекъп + минимума", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /PREV_KB="\$\(du -sk "\$DUMP_TO"/, "размерът на предишния бекъп се мери");
  assert.match(src, /NEED_KB=\$\(\( \$\{PREV_KB:-0\} \* 12 \/ 10 \+ MIN_FREE_KB \)\)/, "нужно = стар × 1,2 + минимум");
});

// Пети преглед (Кодаджията, средна · Възможно): `command: -c max_connections=200` дава Cmd[0]=-c —
// entrypoint-ът сам слага `postgres` отпред. Такава база без pg_isready ставаше тихо „помощник“.
test("Postgres с команда само от флагове (-c …) пак е база, не помощник", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /case "\$pgcmd" in postgres\|-\*\) CKIND\[\$c\]=pgdown;;/, "postgres или флаг → база");
});

// Пети преглед (Кодаджията, ниска): контейнер, изчезнал след първия inspect, убиваше нощния бекъп под set -e.
test("изчезнал контейнер не убива бекъпа и при четенето на working_dir", () => {
  const src = readFileSync(script, "utf8");
  const line = src.split("\n").find((l) => /WORKDIRS\+=\(/.test(l));
  assert.match(line, /2>\/dev\/null \|\| true\)"\)/);
});

// Пети преглед (VPS-аджията, ниски): нощното пускане не пипа PM2; две пускания не се бият за една папка;
// обвивка с Restart= и `compose up` без -d се назовава (във FINAL би вдигнала контейнерите отново).
test("dumps не пипа PM2; ключалка; обвивка с Restart= се предупреждава", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /\[ "\$PM2_LIVE" = 1 \] && \[ "\$MODE" != dumps \]/, "pm2 save само в hot/final");
  assert.match(src, /flock -n 8/, "собствена ключалка");
  assert.match(src, /flock -w 1800 8/, "второто пускане чака, не проваля нощния бекъп");
  assert.match(src, /Restart=\(always\|on-\)/, "обвивка с автоматичен рестарт се проверява");
});

// Шести преглед на PR #312 (Кодаджията, ниска): FIFO с име x.db блокира `head -c 15` като root до 8-часовия
// таван на услугата — нощ без бекъп. Четенето на подписа е с timeout.
test("подписът на SQLite се чете с timeout (FIFO не блокира бекъпа)", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /\[ "\$\(timeout 10 head -c 15 -- "\$f" 2>\/dev\/null\)" = "SQLite format 3" \]/);
});

// Седми преглед (Кодаджията, ниска): `safe` прави „my db“ и „my_db“ едно име — вторият дъмп презаписваше
// първия, а инвентарът показваше и двата „ok“.
test("бази със сходни имена не се презаписват в един дъмп", () => {
  const src = readFileSync(script, "utf8");
  assert.equal((src.match(/f="\$\(uniq_path "\$STAGE\/db\/pg-/g) || []).length, 2, "и двата Postgres пътя минават през uniq_path");
  assert.match(src, /^uniq_path\(\)\{/m, "помощникът е в скрипта");
});

// Осми преглед на PR #312 (Кодаджията, средна · Вероятно): backup API на CPython повтаря стъпката при
// SQLITE_BUSY без горна граница, а FIFO, подменен след проверката на подписа, блокира open() — нощният
// бекъп висеше до 8-часовия таван на услугата. Всяко копие е с таймаут.
test("копието на SQLite е с таймаут (заключена база или FIFO не спира нощния бекъп)", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /timeout -k 10 "\$\{SQLITE_TIMEOUT:-300\}" python3 -I -c "\$SQLITE_PY"/);
  assert.match(src, /timeout -k 10 "\$\{SQLITE_TIMEOUT:-300\}" sqlite3 -readonly/);
});

// Осми преглед (Кодаджията, ниска): жива Mongo в нощния режим даваше само warn → снимката беше
// „nightly“ със суров, неконсистентен WiredTiger. В dumps е fail → partial и видим провал.
test("жива Mongo в нощния режим е провал (partial), не тихо предупреждение", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /mongo\) if \[ "\$MODE" = dumps \]; then fail "MongoDB \$c/);
});
