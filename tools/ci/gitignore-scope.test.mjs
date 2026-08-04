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

test("нито един продуктов .gitignore не крие папка СОРС с неанкериран шаблон", () => {
  // Опасни са само шаблоните за папки, които реално съдържат сорс в някои продукти.
  const RISKY = /^(data|site|src|lib|public|assets|config|templates)\/$/;
  const offenders = [];
  for (const p of productDirs()) {
    const gi = join(ROOT, p, ".gitignore");
    if (!existsSync(gi)) continue;
    readFileSync(gi, "utf8").split("\n").map((l) => l.trim()).forEach((l, i) => {
      if (l.startsWith("#") || !l) return;
      if (RISKY.test(l)) offenders.push(`${p}/.gitignore:${i + 1} → „${l}" (неанкериран: съвпада на ВСЯКА дълбочина; ползвай „/${l}")`);
    });
  }
  assert.deepEqual(offenders, [], "неанкерирани шаблони, които могат да скрият сорс:\n  " + offenders.join("\n  "));
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
