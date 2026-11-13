// autodeploy-panev.test.mjs — IndexNow след здрав релийз на panev (2026-11-13).
//
// Дотогава подаването за Panev беше ръчна стъпка. На 13.11.2026 тя се провали на живо: командата
// беше пусната от /root („Cannot find module '/root/tools/seo/indexnow.mjs'“). А късата форма
// (`indexnow.mjs https://panevascensori.it`) не работи и от правилната директория — ключът на Panev
// е на `<key>.txt` в корена на сайта, не на `/indexnow-key.txt`, и инструментът спира с „Липсва
// валиден IndexNow ключ“. Затова autodeploy.sh го подава сам: от корена на release-а, с
// `--key-file` и `--key-location`, а адресите — от `panev/sitemap.xml` на същия release (ако живият
// sitemap не се изтегли, инструментът подава само началната страница и пак връща 0).
//
// Тестът е ИЗПЪЛНИМ (по модела на autodeploy-mastilko.test.mjs): реже реалните функции от скрипта и
// ги пуска с bash под `set -euo pipefail` върху временна файлова система. npm/systemctl/sudo/rsync/
// install/chown са заглушки, а `tools/seo/indexnow.mjs` в release-а е заглушка, която записва от
// коя директория и с какви аргументи е извикана. Проверява се ПОТОКЪТ: подава ли се само след
// минала сонда, точната команда, и че провал на подаването не е провал на деплоя.
//
// Предпоставките върху файловете на продукта (точно един `panev/<key>.txt`, sitemap на каноничния
// домейн) се пазят в `panev/test/indexnow-key.test.js`: тестовете тук вървят само при промяна по
// tools/ и deploy/ (agents.yml), а онези — при всяка промяна по panev/ (panev.yml).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = readFileSync(join(root, "deploy", "autodeploy.sh"), "utf8");
const fn = (name) => {
  const m = script.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `функцията ${name} съществува`);
  return m[0];
};
// Реалният ред от блока „КОНФИГУРАЦИЯ“ — тестът върви със стойностите по подразбиране на скрипта.
const cfgLine = (name) => {
  const m = script.match(new RegExp(`^${name}="\\$\\{${name}:-[^\\n]*$`, "m"));
  assert.ok(m, `${name} има стойност по подразбиране в блока „КОНФИГУРАЦИЯ“`);
  return m[0];
};

// Ключ, различен от истинския: доказва, че името идва от файла в архива, а не е вписано в скрипта.
const KEY = "0123456789abcdef0123456789abcdef";

// `fail` — "health" | "indexnow" | "";  `env` — променливи на средата за пробега;
// `keyFile` / `sitemap` — false: release без ключов файл / без sitemap.xml;
// `firstDeploy` — в /opt/panev няма предишен код и база (няма към какво да се върне).
function run({ fail = "", env = {}, keyFile = true, sitemap = true, firstDeploy = false } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "panev-")));
  try {
    const src = join(base, "release", "few-few");
    const live = join(base, "opt", "panev");
    const log = join(base, "log.txt");
    const envFile = join(base, "etc", "panev.env");
    mkdirSync(join(src, "panev", "deploy", "systemd"), { recursive: true });
    writeFileSync(join(src, "panev", "VERSION"), "new\n");
    writeFileSync(join(src, "panev", "deploy", "systemd", "panev.service"), "[Unit]\n");
    // Другите .txt в корена на сайта не са ключ и не бива да бъдат взети за такъв.
    for (const f of ["robots.txt", "llms.txt", "humans.txt", "security.txt"]) writeFileSync(join(src, "panev", f), "x\n");
    if (keyFile) writeFileSync(join(src, "panev", `${KEY}.txt`), KEY);
    if (sitemap) writeFileSync(join(src, "panev", "sitemap.xml"), "<urlset><url><loc>https://panevascensori.it/</loc></url></urlset>\n");
    mkdirSync(join(src, "tools", "seo"), { recursive: true });
    writeFileSync(join(src, "tools", "seo", "indexnow.mjs"), [
      'import { appendFileSync } from "node:fs";',
      `appendFileSync(${JSON.stringify(log)}, "indexnow cwd=" + process.cwd() + " args=" + process.argv.slice(2).join(" ") + "\\n");`,
      'process.exit(process.env.INDEXNOW_RC ? Number(process.env.INDEXNOW_RC) : 0);',
    ].join("\n"));
    // Жив предишен деплой: код, база и тайни, които трябва да оцелеят.
    mkdirSync(join(live, "data"), { recursive: true });
    if (!firstDeploy) {
      writeFileSync(join(live, "package.json"), "{}\n");
      writeFileSync(join(live, "VERSION"), "old\n");
      writeFileSync(join(live, "data", "panev.db"), "db\n");
    }
    mkdirSync(dirname(envFile), { recursive: true });
    writeFileSync(envFile, "SMTP_PASS=set\n");
    const cfg = [
      "set -euo pipefail",
      `SRC="${src}"`, `PANEV_DIR="${live}"`, 'PANEV_SERVICE="panev"', `PANEV_ENV="${envFile}"`,
      'PANEV_HEALTH_URL="http://127.0.0.1:0/api/health"', 'TS="20261113-000000"', "deploy_failed=0",
      cfgLine("PANEV_SITE"), cfgLine("PANEV_INDEXNOW"),
      `L="${log}"`, `FAIL="${fail}"`,
      'log(){ :; }; ok(){ :; }; warn(){ echo "WARN $*" >> "$L"; }; die(){ echo "DIE $*" >> "$L"; exit 1; }',
      // Заглушки: само потокът, без системни ефекти.
      'id(){ return 0; }; useradd(){ return 0; }; chown(){ return 0; }; sleep(){ :; }; install(){ return 0; }',
      'systemctl(){ echo "systemctl $*" >> "$L"; }',
      'sudo(){ shift 2; "$@"; }',
      'npm(){ return 0; }; sqlite3(){ return 1; }',
      'health(){ echo "health $1" >> "$L"; [ "$FAIL" != health ]; }',
      // rsync: последните два аргумента са източник/цел; --delete чисти целта без data/ и node_modules/.
      'rsync(){ local a=("$@"); local n=${#a[@]}; local s="${a[n-2]}" d="${a[n-1]}";',
      '  find "$d" -mindepth 1 -maxdepth 1 ! -name data ! -name node_modules -exec rm -rf {} +;',
      '  cp -a "$s". "$d"; }',
      fn("panev_ping_indexnow"), fn("deploy_panev"),
      // Следващият продукт в пробега: ако се стигне дотук, пробегът НЕ е убит.
      "deploy_panev",
      'echo "NEXT_PRODUCT_RAN failed=$deploy_failed" >> "$L"',
    ].join("\n");
    let code = 0;
    const procEnv = { ...process.env, ...env };
    if (fail === "indexnow") procEnv.INDEXNOW_RC = "1";
    try { execFileSync("bash", ["-c", cfg], { encoding: "utf8", stdio: "pipe", env: procEnv }); }
    catch (e) { code = e.status; }
    return { code, src, log: readFileSync(log, "utf8"), version: readFileSync(join(live, "VERSION"), "utf8").trim() };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("здрав релийз: IndexNow се подава от корена на release-а, с ключовия файл и адреса му", () => {
  const r = run();
  assert.equal(r.code, 0);
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=0/);
  assert.equal(r.version, "new");
  const line = r.log.split("\n").find((l) => l.startsWith("indexnow "));
  assert.equal(
    line,
    `indexnow cwd=${r.src} args=https://panevascensori.it --key-file panev/${KEY}.txt --key-location https://panevascensori.it/${KEY}.txt --sitemap panev/sitemap.xml`,
    "командата от panev/DEPLOY.md → „IndexNow“, с адресите от sitemap-а на release-а",
  );
  assert.equal(r.log.match(/^indexnow /gm).length, 1, "едно подаване на деплой");
  assert.ok(r.log.indexOf("health ") < r.log.indexOf("indexnow "), "подаването е СЛЕД здравната проба");
  assert.ok(r.log.indexOf("systemctl restart panev") < r.log.indexOf("indexnow "), "и след рестарта с новия код");
});

test("провалена сонда: без IndexNow — към търсачките отива само release, който работи", () => {
  const r = run({ fail: "health" });
  assert.equal(r.code, 0);
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=1/);
  assert.doesNotMatch(r.log, /indexnow/);
  assert.equal(r.version, "old", "кодът е върнат от бекъпа");
});

test("провал на подаването: предупреждение, не провал на деплоя — пробегът продължава", () => {
  const r = run({ fail: "indexnow" });
  assert.equal(r.code, 0, "set -e не бива да убива целия autodeploy");
  assert.match(r.log, /^indexnow /m, "подаването е опитано");
  assert.match(r.log, /WARN panev: IndexNow подаването пропадна/);
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=0/, "деплоят остава успешен");
  assert.equal(r.version, "new", "без откат заради търсачките");
});

test("PANEV_INDEXNOW=0 спира подаването, без предупреждение", () => {
  const r = run({ env: { PANEV_INDEXNOW: "0" } });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.log, /indexnow|IndexNow/);
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=0/);
});

test("PANEV_SITE от средата сменя и сайта, и адреса на ключа (крайната наклонена черта не се удвоява)", () => {
  const r = run({ env: { PANEV_SITE: "https://staging.example.test/" } });
  assert.match(r.log, new RegExp(`args=https://staging\\.example\\.test --key-file panev/${KEY}\\.txt --key-location https://staging\\.example\\.test/${KEY}\\.txt --sitemap panev/sitemap\\.xml$`, "m"));
});

test("release без ключов файл: пропуска с предупреждение, деплоят остава успешен", () => {
  const r = run({ keyFile: false });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.log, /^indexnow /m);
  assert.match(r.log, /WARN panev: няма IndexNow ключ/);
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=0/);
});

test("release без sitemap.xml: подава без --sitemap (подразбирането на инструмента), не пада", () => {
  const r = run({ sitemap: false });
  assert.equal(r.code, 0);
  assert.match(r.log, new RegExp(`--key-location https://panevascensori\\.it/${KEY}\\.txt$`, "m"));
  assert.doesNotMatch(r.log, /--sitemap/);
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=0/);
});

test("първи деплой с провалена сонда: няма предишен код за връщане — и пак без IndexNow", () => {
  const r = run({ fail: "health", firstDeploy: true });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.log, /^indexnow /m);
  assert.match(r.log, /WARN panev: първи деплой/);
  assert.match(r.log, /NEXT_PRODUCT_RAN failed=1/);
});

// Истинският помощник с истинския инструмент върху файловете в репото, без мрежа: ключът идва от
// файл, адресите — от локалния sitemap, а `--dry-run` (добавен от обвивката на node) спира преди
// подаването. Заглушката по-горе не може да хване ключов файл, който инструментът не приема, нито
// sitemap, от който не излиза нито един адрес.
test("в репото: истинският инструмент приема ключа и изброява всички адреси от panev/sitemap.xml (--dry-run)", () => {
  const keyFile = readdirSync(join(root, "panev")).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.ok(keyFile, "в panev/ има ключов файл <key>.txt (пази го panev/test/indexnow-key.test.js)");
  const key = keyFile.replace(/\.txt$/, "");
  const locs = new Set([...readFileSync(join(root, "panev", "sitemap.xml"), "utf8").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]));
  assert.ok(locs.size > 1, "sitemap-ът в репото има страници");
  const out = execFileSync("bash", ["-c", [
    "set -euo pipefail",
    `SRC="${root}"`, cfgLine("PANEV_SITE"), cfgLine("PANEV_INDEXNOW"),
    'warn(){ echo "WARN $*"; }',
    'node(){ command node "$@" --dry-run; }',
    fn("panev_ping_indexnow"),
    "panev_ping_indexnow",
  ].join("\n")], { encoding: "utf8", stdio: "pipe", env: { ...process.env, PANEV_SITE: "", PANEV_INDEXNOW: "" } });
  assert.match(out, new RegExp(`^IndexNow · host=panevascensori\\.it · ${locs.size} URL · keyLocation=https://panevascensori\\.it/${key}\\.txt$`, "m"));
  assert.match(out, /--dry-run: нищо не е подадено/);
  assert.doesNotMatch(out, /WARN/);
});
