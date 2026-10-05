// tools/agents/oversee.test.mjs — тестове за чистата логика на надзора (Изпитателят).
//
// Нула зависимости: вграденият `node:test` + `node:assert` (стилът „zero-dep" на инструментите).
// Пусни: `node --test tools/agents/`  (или `node --test tools/agents/oversee.test.mjs`).
//
// Покрива сърцевината на закона „източник или нищо" (hasSource/tailHasSource — 6-те клона + отрицателния),
// блок-осъзнатото четене (sectionBullets), балансирания парсер на FALLBACK (extractBalancedObject),
// Jaccard-дедупа и детерминистичния daysSince. Логиката е чиста → тества се директно, без файлове.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasSource, tailHasSource, jaccard, sectionBullets, extractBalancedObject,
  daysSince, lessonDate, norm, MERGE_THRESHOLD, plainScalarHazard, repeatsLearnProtocol, yamlPlainCut,
} from "./oversee-lib.mjs";

test("repeatsLearnProtocol: секцията „самообучаващ се цикъл“ се хваща, един ред с доменен гейт — не", () => {
  const old = "## v6.0 — самообучаващ се цикъл (наложен от hooks)\n- **Запиши:** завърши **всеки** отговор с блок ```learn (схема в `_memory/PROTOCOL.md`):";
  assert.equal(repeatsLearnProtocol(old), true);
  assert.equal(repeatsLearnProtocol("## Памет и самообучаващ се цикъл (v4.0–v6.0, наложен от hooks)\n- **Чети:** …"), true, "друго заглавие, същата секция");
  assert.equal(repeatsLearnProtocol("- **Запиши:** завърши всеки отговор с блок ```learn (схема в `_memory/PROTOCOL.md`)"), true, "схемата без заглавие");
  assert.equal(repeatsLearnProtocol("- **Памет:** поука е `verified` само след реален гейт (docs / реален ран / eval); иначе Карантина."), false);
  assert.equal(repeatsLearnProtocol("Завършвай с ```learn блок (виж `_memory/PROTOCOL.md`) само с ново проверено знание."), false, "препратка без схема е наред");
});

test("plainScalarHazard: „ #“ отрязва описанието (реалният случай на Социалджията), „: “ чупи YAML", () => {
  const old = "Социалджията — експерт Social Media Manager, чиято работа #1 е МАКСИМАЛНА видимост/обхват (reach)";
  assert.match(plainScalarHazard(old), /коментар/, "„ #1“ → всичко след него се губи");
  assert.match(plainScalarHazard("свързаните технически артефакти: политика"), /невалиден YAML/);
  assert.match(plainScalarHazard("[списък] в началото"), /индикатор/);
  assert.match(plainScalarHazard("- тире в началото"), /индикатор/);
  assert.match(plainScalarHazard("завършва с двоеточие:"), /завършва/);
  assert.equal(plainScalarHazard("празно"), null);
  assert.equal(plainScalarHazard(""), "празно");
  assert.equal(plainScalarHazard("Сийдъра — регистрира ги в db:seed:all и пише файл:ред, Lua и C#"), null, "двоеточие/диез без интервал пред тях са безопасни");
  assert.match(plainScalarHazard("и #hashtag"), /коментар/, "интервал + диез е коментар дори без цифра");
  assert.equal(plainScalarHazard('"в кавички: може # всичко"'), null, "кавичките го пазят");
  assert.equal(plainScalarHazard(">-"), null, "блоков скалар");
});

test("tailHasSource: последният ;-сегмент е източникът", () => {
  assert.equal(tailHasSource("scope; verified; https://a.bg/x"), true);
  assert.equal(tailHasSource('"scope"; verified; "Fowler, Refactoring 2nd ed."'), true);
  assert.equal(tailHasSource("scope; verified"), false, "само verified без източник → няма");
  assert.equal(tailHasSource("scope; verified; "), false, "празен източник → няма");
  assert.equal(tailHasSource("само едно поле"), false, "под 2 сегмента → няма");
  assert.equal(tailHasSource(null), false);
  assert.equal(tailHasSource("s; verified; ab"), false, "източник ≤3 символа → няма");
});

test("hasSource: 6-те легитимни формата + отрицателният случай", () => {
  assert.equal(hasSource('поука _("scope"; verified; "https://sre.google/x")_'), true, "trailing канонична");
  assert.equal(hasSource("поука (Източник: developer.android.com/foo)"), true, "inline (Източник:)");
  assert.equal(hasSource("поука (Source: example.org/doc здесь)"), true, "inline (Source:)");
  assert.equal(hasSource("виж https://opentelemetry.io/docs/ някъде"), true, "гол URL");
  assert.equal(hasSource("бъг в tools/agents/oversee.mjs:42"), true, "file:line");
  assert.equal(hasSource("поправка в src/lib/foo.ts"), true, "репо файл .ts");
  assert.equal(hasSource("виж папка tools/security/ за скрипта"), true, "репо път");
  assert.equal(hasSource("просто твърдение без никакъв източник тук"), false, "нищо → без източник");
  assert.equal(hasSource(""), false);
  assert.equal(hasSource(null), false);
});

test("hasSource: чете ЦЕЛИЯ блок (източник на continuation ред брои)", () => {
  const block = "- **2026-01-01:** факт продължава на следващ ред (Източник: web.dev/foo)";
  assert.equal(hasSource(block), true);
});

test("jaccard: идентичност=1, чужди=0, частично между", () => {
  assert.equal(jaccard("едно и също изречение тук", "едно и също изречение тук"), 1);
  assert.equal(jaccard("абсолютно различни думички понятия", "коренно несходни фрази изрази"), 0);
  const j = jaccard("наблюдаемост метрики логове следи", "наблюдаемост метрики следи график");
  assert.ok(j > 0 && j < 1, `частично припокриване: ${j}`);
});

test("jaccard: близък парафраз ≥ MERGE_THRESHOLD (дедуп го хваща)", () => {
  const a = "SLO носи error budget равен на едно минус целта по събития";
  const b = "SLO носи error budget равен на едно минус целта по общо събития";
  assert.ok(jaccard(a, b) >= MERGE_THRESHOLD, `${jaccard(a, b)} трябва ≥ ${MERGE_THRESHOLD}`);
});

test("sectionBullets: слива многоредова поука в един блок, спира на следваща секция", () => {
  const md = [
    "## Проверени поуки (verified)",
    "- **2026-01-01:** първа поука едноредова _(a; verified; b.bg/x)_",
    "- **2026-01-02:** втора поука",
    "  продължава на continuation ред _(c; verified; d.bg/y)_",
    "",
    "## Карантина",
    "- **2026-01-03:** карантинна поука",
  ].join("\n");
  const v = sectionBullets(md, "Проверени поуки");
  assert.equal(v.length, 2, "две поуки (continuation не е нова)");
  assert.match(v[1], /continuation ред/, "втората включва continuation текста");
  assert.equal(hasSource(v[1]), true, "източникът от continuation ред се брои");
  assert.equal(sectionBullets(md, "Карантина").length, 1);
  assert.deepEqual(sectionBullets(md, "Няма такава"), []);
});

test("extractBalancedObject: балансиран {…} с } вътре в низ + escape", () => {
  const html = 'преди const FALLBACK = { "a": 1, "s": "има } вътре \\" и пак }", "b": { "n": 2 } }; после';
  const block = extractBalancedObject(html, "const FALLBACK = {");
  assert.ok(block, "намери блок");
  const parsed = JSON.parse(block);
  assert.equal(parsed.a, 1);
  assert.equal(parsed.b.n, 2);
  assert.equal(parsed.s, 'има } вътре " и пак }');
});

test("extractBalancedObject: липсващ маркер/скоба → null", () => {
  assert.equal(extractBalancedObject("няма маркер тук", "const FALLBACK = {"), null);
  assert.equal(extractBalancedObject("const FALLBACK = { незатворен", "const FALLBACK = {"), null);
});

test("daysSince: детерминистично спрямо подаден 'днес'", () => {
  assert.equal(daysSince("2026-07-01", "2026-07-17"), 16);
  assert.equal(daysSince("2026-07-17", "2026-07-17"), 0);
});

test("lessonDate: вади датата от **YYYY-MM-DD:**", () => {
  assert.equal(lessonDate("- **2026-07-17:** нещо"), "2026-07-17");
  assert.equal(lessonDate("- без дата"), null);
});

test("norm: маха **, кавички, trailing _(…)_ и свива интервали", () => {
  assert.equal(norm('**Факт**   с   кавички „x“ _(a; b; c)_'), "факт с кавички x");
});

test("yamlPlainCut: „ #“ в нецитирано описание го реже; цитирано/блоково/без интервал — не", () => {
  assert.equal(yamlPlainCut("Социалджията — работа #1 е обхват"), "Социалджията — работа".length);
  assert.equal(yamlPlainCut("a\t# b"), 1);
  assert.equal(yamlPlainCut("работа №1 е обхват"), -1);
  assert.equal(yamlPlainCut("C#, F# и хаштаг#без интервал преди"), -1);
  assert.equal(yamlPlainCut('"работа #1 в кавички"'), -1);
  assert.equal(yamlPlainCut("'работа #1 в апострофи'"), -1);
  assert.equal(yamlPlainCut(">-"), -1);
});
