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
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP = new Set(["node_modules", "tools", "deploy", "docs", "research", "client", "agents-dashboard", ".git"]);

const productDirs = () => readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !SKIP.has(d.name))
  .map((d) => d.name)
  .filter((n) => existsSync(join(ROOT, n, "package.json")) || existsSync(join(ROOT, n, "CLAUDE.md")));

/** Истината за „игнориран ли е" идва от самия git, не от препрочитане на шаблоните. */
const isIgnored = (rel) =>
  spawnSync("git", ["check-ignore", "-q", rel], { cwd: ROOT }).status === 0;

// ПОВЕДЕНЧЕСКИ, не шаблонен. Първата версия гейтваше самия ШАБЛОН (неанкериран `data/`) и това ме
// накара да „поправя" превантивно три несвързани продукта — при което scope-check с право падна:
// монорепо закон №1 е един продукт на промяна. Правило, което за да е зелено иска да пипнеш чужди
// продукти, е сгрешено правило. Затова тук се съди ЕФЕКТЪТ: игнориран ли е файл, който кодът внася.
// Неанкериран `data/` в продукт без вложена `data/` папка е безобиден и не бива да гейтва нищо.
test("нито един продукт не ИГНОРИРА файл, който собственият му код внася", () => {
  const SRC = /\.(mjs|js|ts|tsx|jsx)$/;
  const SKIP_DIR = new Set(["node_modules", ".next", "dist", "build", ".git", "coverage"]);
  const offenders = [];
  for (const p of productDirs()) {
    const files = [];
    (function walk(d) {
      let ents; try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(join(d, e.name)); }
        else if (SRC.test(e.name)) files.push(join(d, e.name));
      }
    })(join(ROOT, p));
    for (const f of files.slice(0, 400)) {            // таван: държим теста бърз
      let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
      for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
        const target = join(dirname(f), m[1]).replace(ROOT + "/", "");
        // Съди ПАПКАТА на целта: липсващ файл е друг проблем (може да е .ts→.js), скрит е този.
        const dir = dirname(target);
        if (isIgnored(dir) || isIgnored(target))
          offenders.push(`${f.replace(ROOT + "/", "")} внася „${m[1]}" → „${target}", но git го ИГНОРИРА`);
      }
    }
  }
  assert.deepEqual([...new Set(offenders)], [],
    "код внася файл, който .gitignore крие (невидим за CI, за деплой архива и за ревюто):\n  " + offenders.join("\n  "));
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
  const code = s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  assert.ok(!/npm run build:site/.test(code), "build:site не бива да е в гейта, докато site/data липсва");
});
