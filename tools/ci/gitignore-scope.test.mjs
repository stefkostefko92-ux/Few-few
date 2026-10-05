// gitignore-scope.test.mjs — .gitignore шаблон НЕ бива да крие СОРС, който кодът внася.
//
// Реален дефект (2026-08-04): `panev/.gitignore` съдържаше НЕАНКЕРИРАН `data/`. Замисълът е базата
// (`panev/data/panev.db` — до него стоят `*.db` правилата), но неанкериран шаблон в git съвпада с
// ВСЯКА папка на име `data` на ВСЯКА дълбочина — значи скри и `panev/site/data/`, където живеят
// i18n източниците, които `site/build.mjs` внася (`./data/i18n/{it,en,bg}.mjs`). Файловете така и
// не влязоха в репото: `npm run build:site` пада в чист клон, значи и в CI, и в ДЕПЛОЙ АРХИВА.
// Никой не разбра, защото panev беше единственият продукт без workflow.
//
// Поправка: `/data/` (анкер към корена на продукта) — пази замисъла, спира случайното криене.
// Тук гейтваме КЛАСА, не единичния случай.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP = new Set(["node_modules", "tools", "deploy", "docs", "research", "client", "agents-dashboard", ".git"]);

const productDirs = () => readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !SKIP.has(d.name))
  .map((d) => d.name)
  .filter((n) => existsSync(join(ROOT, n, "package.json")) || existsSync(join(ROOT, n, "CLAUDE.md")));

/** Истината за „игнориран ли е" идва от самия git, не от препрочитане на шаблоните. */
const isIgnored = (rel, root = ROOT) =>
  spawnSync("git", ["check-ignore", "-q", rel], { cwd: root }).status === 0;

/** Кои от пътищата git игнорира — една заявка за целия списък (процес на файл е бавно). Проследен
 *  файл не е игнориран, каквито и шаблони да съвпадат (така работи `git check-ignore` без --no-index). */
function ignoredOf(rels, root = ROOT) {
  if (!rels.length) return new Set();
  const r = spawnSync("git", ["check-ignore", "--stdin"], { cwd: root, input: rels.join("\n") + "\n", encoding: "utf8" });
  return new Set((r.stdout ?? "").split("\n").filter(Boolean));
}

const SRC = /\.(mjs|js|ts|tsx|jsx)$/;
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "build", ".git", "coverage"]);

/**
 * Сорс, който внася файл, скрит от .gitignore. Внасящият, който git САМ игнорира, не се съди: това е
 * изход на билд (бъндъл, който внася собствените си парчета — korpora/public/editor/), прави се
 * заедно с тях и никой не го очаква в git. Без това тестът падаше на всяка машина, събрала редактора,
 * а в чист клон (CI) минаваше — гейт, който отговаря различно на двете места.
 */
function offenders(root, products) {
  const found = [];
  for (const p of products) {
    const files = [];
    (function walk(d) {
      let ents; try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(join(d, e.name)); }
        else if (SRC.test(e.name)) files.push(join(d, e.name));
      }
    })(join(root, p));
    const rel = (f) => f.replace(root + "/", "");
    const generated = ignoredOf(files.map(rel), root);
    const sources = files.filter((f) => !generated.has(rel(f)));
    for (const f of sources.slice(0, 400)) {          // таван: държим теста бърз
      let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
      for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
        const target = rel(join(dirname(f), m[1]));
        // Съди ПАПКАТА на целта: липсващ файл е друг проблем (може да е .ts→.js), скрит е този.
        const dir = dirname(target);
        if (isIgnored(dir, root) || isIgnored(target, root))
          found.push(`${rel(f)} внася „${m[1]}" → „${target}", но git го ИГНОРИРА`);
      }
    }
  }
  return [...new Set(found)];
}

// ПОВЕДЕНЧЕСКИ, не шаблонен. Първата версия гейтваше самия ШАБЛОН (неанкериран `data/`) и това ме
// накара да „поправя" превантивно три несвързани продукта — при което scope-check с право падна:
// монорепо закон №1 е един продукт на промяна. Правило, което за да е зелено иска да пипнеш чужди
// продукти, е сгрешено правило. Затова тук се съди ЕФЕКТЪТ: игнориран ли е файл, който кодът внася.
// Неанкериран `data/` в продукт без вложена `data/` папка е безобиден и не бива да гейтва нищо.
test("нито един продукт не ИГНОРИРА файл, който собственият му код внася", () => {
  const found = offenders(ROOT, productDirs());
  assert.deepEqual(found, [],
    "код внася файл, който .gitignore крие (невидим за CI, за деплой архива и за ревюто):\n  " + found.join("\n  "));
});

// ЗЪБИТЕ на пропускането: в отделно git репо — сорс, който внася скрит файл, пак пада; изход на билд,
// който внася своето парче, не пада. Без зависимост от наредбата на който и да е продукт.
test("изход на билд, който внася своите парчета, не е нарушение — сорс, който внася скрит файл, е", () => {
  const dir = mkdtempSync(join(tmpdir(), "gitignore-scope-"));
  try {
    assert.equal(spawnSync("git", ["init", "-q"], { cwd: dir }).status, 0, "git init");
    mkdirSync(join(dir, "app", "src"), { recursive: true });
    mkdirSync(join(dir, "app", "out", "chunks"), { recursive: true });
    writeFileSync(join(dir, "app", ".gitignore"), "/out/\n");
    writeFileSync(join(dir, "app", "src", "main.js"), 'import "../out/chunks/a.js";\n');
    writeFileSync(join(dir, "app", "out", "entry.js"), 'import "./chunks/a.js";\n');
    writeFileSync(join(dir, "app", "out", "chunks", "a.js"), "export {};\n");
    assert.deepEqual(offenders(dir, ["app"]), [
      'app/src/main.js внася „../out/chunks/a.js" → „app/out/chunks/a.js", но git го ИГНОРИРА',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("panev: замисълът е запазен — базата се игнорира, site/data НЕ се игнорира", () => {
  // Двата инварианта на конкретната поправка (regression за реалния дефект).
  assert.ok(isIgnored("panev/data/panev.db"), "базата на panev трябва да остане извън git");
  assert.ok(!isIgnored("panev/site/data/i18n/it.mjs"), "i18n източниците на сайта НЕ бива да са скрити");
});

test("panev вече има собствен path-филтриран workflow (беше единственият продукт без CI)", () => {
  const wf = join(ROOT, ".github", "workflows", "panev.yml");
  assert.ok(existsSync(wf), "panev.yml липсва");
  const s = readFileSync(wf, "utf8");
  assert.match(s, /'panev\/\*\*'/, "тригерът трябва да е филтриран по panev/**");
  assert.match(s, /node --check/, "гейтът проверява поне синтаксиса на сорса");
  // build:site СЪЗНАТЕЛНО липсва, докато site/data не е в репото — не слагаме червен гейт на main.
  // Коментарите се махат преди проверката: самият workflow ОБЯСНЯВА защо го няма и наивният
  // регекс щеше да съвпадне с обяснението (детектор, който чете проза вместо код).
  // Махаме и коментарите, И ехо-редовете: workflow-ът вече ИЗБРОЯВА липсващите модули и в текста
  // на предупреждението СПОМЕНАВА `npm run build:site` („щом ги има, добави тази стъпка"). Първата
  // версия на този тест търсеше литерала навсякъде и падна точно на това — детектор, който брои
  // СПОМЕНАВАНЕ вместо ИЗПЪЛНЕНИЕ. Същият клас, който хванах вече три пъти в този репо.
  const code = s.split("\n")
    .filter((l) => !/^\s*#/.test(l))          // YAML коментар
    .filter((l) => !/^\s*echo\s/.test(l))     // ехо в лога, не изпълнена команда
    .join("\n");
  assert.ok(!/npm run build:site/.test(code), "build:site не бива да е в гейта, докато site/data липсва");

  // ЗЪБИТЕ: реална `run:` стъпка с build:site пак трябва да пада.
  const withReal = code + "\n      - name: Билд\n        run: npm run build:site\n";
  assert.ok(/npm run build:site/.test(withReal), "предпоставка — иначе горната проверка е празна");

  // И обратното: блокерът трябва да е ВИДИМ в лога, не само в YAML коментар.
  assert.match(s, /site\/data\/products\.mjs/, "стъпката трябва да изброява конкретните липсващи модули");
  assert.match(s, /::warning/, "липсата се вижда като GitHub warning на всеки рън");
});
