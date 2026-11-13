// collect-claude-md.test.mjs — docs.js (таблото) отразява реалните CLAUDE.md.
//
// Реален дефект (2026-08-04): docs.js беше замразен на 2026-07-28, а root CLAUDE.md порасна
// 15697→26282b — таблото показваше документ ~40% по-къс от реалния. Проверката СЪЩЕСТВУВАШЕ
// (--check), но: (1) не се викаше от нито един гейт/CI → дрейфът беше невидим; (2) беше ДАТА-
// ЧУВСТВИТЕЛНА (сравняваше цял body с вградена дата) → щеше да е червена ВСЕКИ ден, затова не
// можеше да се гейтне. Тук пазим и двете: --check е дата-нечувствителна и е в gate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOL = join(ROOT, "tools/docs/collect-claude-md.mjs");
const REAL = join(ROOT, "agents-dashboard/docs.js");
// Тестовете работят върху ВРЕМЕННО копие (DOCS_JS_OUT), никога върху docs.js в репото. Преди
// регенерираха истинския файл на място и го връщаха — а `node --test` пуска файловете едновременно,
// така че build-artifact.test.mjs понякога четеше регенерирания файл по средата (2026-11-13: 3 случайни
// червени в пълния пробег; сами минаваха 21/21).
const TMP = mkdtempSync(join(tmpdir(), "docs-js-"));
const OUT = join(TMP, "docs.js");
const withOut = (env = {}) => ({ ...process.env, DOCS_JS_OUT: OUT, ...env });
const run = (env = {}) => spawnSync(process.execPath, [TOOL, "--check"], { cwd: ROOT, encoding: "utf8", env: withOut(env) });
const generate = (env = {}) => spawnSync(process.execPath, [TOOL], { cwd: ROOT, encoding: "utf8", env: withOut(env) });
const realBefore = readFileSync(REAL, "utf8");
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

// ВАЖНО (CI провал 2026-08-04): тези тестове НЕ бива да зависят от това дали КОМИТНАТИЯТ docs.js е
// свеж в момента. Първата им версия твърдеше „--check е зелен днес" и падаше в CI, защото main
// продължаваше да мени CLAUDE.md, а артефактът се съди срещу СЛЯТОТО дърво. Точно тази зависимост
// махнахме от гейта (docs-fresh е съветващ, main се лекува сам) — тя не бива да се върне през
// тестовете. Затова тук първо РЕГЕНЕРИРАМЕ (тестваме ИНСТРУМЕНТА, не състоянието на репото), после
// съдим — във временния файл, без да пипаме истинския.
function withFreshDocs(fn) {
  assert.equal(generate().status, 0, "генераторът трябва да мине");
  return fn();
}

test("след регенерация --check е зелен (инструментът е самосъгласуван)", () => {
  withFreshDocs(() => assert.equal(run().status, 0, "генератор и проверка трябва да се съгласяват"));
});

test("--check е ДАТА-НЕЧУВСТВИТЕЛНА (различна дата НЕ пали фалшив дрейф)", () => {
  // Дори с бъдеща GENERATED_DATE проверката трябва да мине — иначе гейтът е червен всеки ден.
  withFreshDocs(() =>
    assert.equal(run({ GENERATED_DATE: "2099-12-31" }).status, 0, "само датата не бива да пали дрейф"));
});

test("--check е РЕД-НЕЧУВСТВИТЕЛНА (CI провалът 2026-08-04: друга ICU колация → друг ред)", () => {
  // Гейтът беше зелен локално и червен в CI БЕЗ байт разлика в съдържанието — различаваше се само
  // РЕДЪТ (генераторът подреждаше с `localeCompare`, който зависи от локал/ICU).
  withFreshDocs(() => {
    const fresh = readFileSync(OUT, "utf8");
    const d = JSON.parse(fresh.match(/window\.__DOCS__ = ([\s\S]*?);\nvar docs/)[1]);
    d.files = [...d.files].reverse();
    const banner = "// АВТО-ГЕНЕРИРАН от tools/docs/collect-claude-md.mjs — не редактирай ръчно.\n";
    writeFileSync(OUT, banner + "window.__DOCS__ = " + JSON.stringify(d, null, 2) + ";\nvar docs = window.__DOCS__;\n");
    assert.equal(run().status, 0, "различен РЕД при същото съдържание НЕ бива да пали гейта");
  });
});

test("генераторът НЕ ползва localeCompare (артефакт за байтово сравнение иска локал-независим ред)", () => {
  const src = readFileSync(TOOL, "utf8");
  const code = src.replace(/^\s*\/\/.*$/gm, ""); // махни коментарите — там думата се СПОМЕНАВА
  assert.ok(!/localeCompare/.test(code),
    "localeCompare зависи от локал/ICU → редът се разминава между машини (реалният CI провал)");
});

test("docs-sync.yml: main се лекува сам, БЕЗ безкраен цикъл и с най-малки права", () => {
  // Решение на собственика (2026-08-04): docs.js е генериран артефакт, гейтването му в PR правеше
  // отворените PR-и червени от чужд churn в main. Сега main регенерира и комитва сам. Тук пазим
  // трите свойства, които правят това безопасно.
  const wf = join(ROOT, ".github", "workflows", "docs-sync.yml");
  assert.ok(existsSync(wf), "docs-sync.yml липсва — main няма да се лекува сам");
  const s = readFileSync(wf, "utf8");
  const code = s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"); // без коментарите

  // 1) БЕЗ ЦИКЪЛ: тригерът НЕ слуша артефакта, който самият workflow комитва.
  const onBlock = code.slice(0, code.indexOf("jobs:"));
  assert.ok(!/agents-dashboard\/docs\.js/.test(onBlock),
    "тригерът не бива да слуша docs.js — собственият комит би стартирал нов ран (безкраен цикъл)");
  assert.match(onBlock, /\*\*\/CLAUDE\.md/, "тригерът трябва да слуша всички CLAUDE.md");

  // 2) САМО main: артефактът се лекува там, където е канонично.
  assert.match(onBlock, /branches:\s*\[main\]/, "само push в main");

  // 3) НАЙ-МАЛКИ ПРАВА: contents: write само на job-а, не глобално.
  assert.match(code, /^permissions:\s*\n\s+contents:\s*read/m, "глобалните права остават read");
  assert.match(code, /contents:\s*write/, "job-ът, който комитва, има нужното право");

  // 4) Комитва САМО артефакта и само при реална промяна.
  assert.match(code, /git diff --quiet -- agents-dashboard\/docs\.js/, "комит само при реална промяна");
  assert.match(code, /git add agents-dashboard\/docs\.js/, "комитва само артефакта");
});

test("docs-fresh е СЪВЕТВАЩ в гейта (иначе PR-ите причервяват от чужд churn в main)", () => {
  const gate = readFileSync(join(ROOT, "tools", "agents", "gate.mjs"), "utf8");
  const line = gate.split("\n").find((l) => /id:\s*"docs-fresh"/.test(l));
  assert.ok(line, "docs-fresh липсва от gate.mjs");
  assert.match(line, /required:\s*false/,
    "докато main се лекува сам, docs-fresh не бива да е задължителен — иначе се връща въртележката");
});

test("--check ХВАЩА реален дрейф на съдържанието", () => {
  // Първо регенерирай: иначе, ако артефактът вече е остарял (main мени CLAUDE.md), тестът щеше
  // да мине ПРАЗНО — щеше да чете единица, дошла от чужд дрейф, а не от собствената мутация.
  withFreshDocs(() => {
    assert.equal(run().status, 0, "предпоставка: след регенерация е зелено");
    const fresh = readFileSync(OUT, "utf8");
    const mutated = fresh.replace(/("content":\s*")/, '$1ДРЕЙФ-ТЕСТ ');
    assert.notEqual(mutated, fresh, "мутацията трябва да промени файла");
    writeFileSync(OUT, mutated);
    assert.equal(run().status, 1, "променен docs.js (различен от реалните CLAUDE.md) трябва да ПАДНЕ");
  });
});

// Реален дефект (2026-11-13): FiveM/CLAUDE.md споменава `</script>` в проза. Генераторът го пишеше
// буквално, а build-artifact.mjs вгражда docs.js в <script>…</script> — блокът се затваряше по-рано и
// билдът на артефакта падаше със заблуждаващото „остана обвиващ таг: <html“. Докато docs.js беше
// остарял (от 2026-11-02), дефектът спеше; всяко регенериране го будеше.
test("docs.js е безопасен за вграждане в <script>: нито едно буквално `</`, а съдържанието е непокътнато", () => {
  withFreshDocs(() => {
    const out = readFileSync(OUT, "utf8");
    assert.doesNotMatch(out, /<\//, "`</` трябва да излиза като `<\\/` — иначе `</script>` от CLAUDE.md затваря вградения блок");
    const files = JSON.parse(out.match(/window\.__DOCS__ = ([\s\S]*?);\nvar docs/)[1]).files;
    let withClosingTag = 0;
    for (const f of files) {
      const src = readFileSync(join(ROOT, f.path), "utf8");
      assert.equal(f.content, src, `${f.path}: съдържанието след разчитане е същото като файла`);
      if (src.includes("</")) withClosingTag++;
    }
    assert.ok(withClosingTag > 0, "поне един CLAUDE.md съдържа `</` — иначе тестът не доказва нищо");
  });
});

test("генераторът пише там, където сочи DOCS_JS_OUT, и не пипа docs.js в репото", () => {
  withFreshDocs(() => {
    assert.ok(existsSync(OUT), "временният изход е записан");
    assert.deepEqual(readdirSync(TMP), ["docs.js"]);
  });
  assert.equal(readFileSync(REAL, "utf8"), realBefore, "истинският docs.js е непроменен след всички тестове дотук");
});
