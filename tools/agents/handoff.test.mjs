// handoff.test.mjs — договорът за колаборация трябва да е ИЗПЪЛНИМ, не проповядван.
//
// Дефектът, който този файл пази да не се върне: `PROCEDURE.md` изисква блока „ПРЕДАВАНЕ" от всеки
// агент при всеки старт (плаща се ~3.8k т/вълна, за да бъде инжектиран), а НИЩО не проверяваше, че
// агентът наистина го е произвел. Веригата можеше да се къса тихо — следващият получаваше свободен
// текст вместо структура. Доктрина без гейт е декорация.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateHandoff, extractBlock, STATUSES } from "./handoff.mjs";

const AGENTS = new Set(["kodadjiyata", "izpitatelya", "prodavacha", "pravniyat-razbirach"]);
const opts = { agentIds: AGENTS };

const OK = `## ПРЕДАВАНЕ
От: kodadjiyata → Към: izpitatelya
Статус: има бележки
Находки: linketto/src/lib/jsonld.ts:14 — липсва escape на U+2028 (Сигурно)
Изход/артефакт: ревю на diff-а + минимална поправка
Следваща стъпка: Изпитателят пише e2e за вектора, преди merge`;

test("валиден блок минава и полетата се извличат", () => {
  const r = validateHandoff(OK, opts);
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.equal(r.fields.from, "kodadjiyata");
  assert.equal(r.fields.to, "izpitatelya");
  assert.equal(r.fields.status, "има бележки");
});

test("липсващ блок е нарушение — това е самото късане на веригата", () => {
  const r = validateHandoff("Готово, поправих го. Изглежда добре.", opts);
  assert.equal(r.ok, false);
  assert.match(r.problems[0].msg, /липсва блокът/);
});

test("празен текст с requireBlock:false не е нарушение (не заклещвай агент без изход)", () => {
  assert.equal(validateHandoff("", { ...opts, requireBlock: false }).ok, true);
});

// --- Кирилица и \b: дефектът, който собственият smoke тест хвана -------------------
// `\b` в JS е ASCII-базирана. `/\bсигурно\b/` НЕ хваща „(Сигурно)", защото кирилицата не е `\w`
// и граница между `(` и `С` не се образува. Проверката тихо не намираше нищо и пропускаше всичко.

test("етикетът на увереност се разпознава на кирилица (ASCII \\b мълчаливо не хващаше)", () => {
  for (const label of ["(Сигурно)", "— сигурно", "Вероятно,", "„Несигурно“", "[verified]"]) {
    const t = OK.replace("(Сигурно)", label);
    const r = validateHandoff(t, opts);
    assert.deepEqual(r.problems, [], `етикет „${label}" трябва да мине`);
  }
});

test("находка БЕЗ етикет на увереност пада (red line 3)", () => {
  const t = OK.replace(" (Сигурно)", "");
  const r = validateHandoff(t, opts);
  assert.ok(r.problems.some((p) => /увереност/.test(p.msg)));
});

test("находка БЕЗ файл:ред пада (закон източник-или-мълчание)", () => {
  const t = OK.replace("linketto/src/lib/jsonld.ts:14 — липсва escape на U+2028", "има някакъв проблем някъде");
  const r = validateHandoff(t, opts);
  assert.ok(r.problems.some((p) => /файл:ред/.test(p.msg)));
});

test("URL се брои за източник наравно с файл:ред", () => {
  const t = OK.replace("linketto/src/lib/jsonld.ts:14", "https://developer.mozilla.org/x");
  assert.deepEqual(validateHandoff(t, opts).problems, []);
});

// --- Статус и адресат ------------------------------------------------------------

test("Статус извън договора пада; трите валидни минават", () => {
  assert.ok(validateHandoff(OK.replace("Статус: има бележки", "Статус: горе-долу"), opts)
    .problems.some((p) => p.field === "Статус"));
  for (const s of STATUSES) {
    const t = OK.replace("Статус: има бележки", `Статус: ${s}`);
    const r = validateHandoff(t, opts);
    if (s === "наред") assert.deepEqual(r.problems, [], `„${s}" трябва да мине`);
    else assert.ok(r.ok || r.problems.length === 0, `„${s}" с находки трябва да мине`);
  }
});

test("Статус наред не изисква находки, но блокер изисква", () => {
  const nared = `## ПРЕДАВАНЕ
От: kodadjiyata → Към: izpitatelya
Статус: наред
Находки: няма
Изход/артефакт: ревю без забележки
Следваща стъпка: Изпитателят пуска e2e`;
  assert.deepEqual(validateHandoff(nared, opts).problems, []);

  const blokerBezNahodki = nared.replace("Статус: наред", "Статус: блокер");
  const r = validateHandoff(blokerBezNahodki, opts);
  assert.ok(r.problems.some((p) => p.field === "Находки"), "блокер без находки е безсмислен");
});

test("непознат адресат пада — веригата не бива да сочи в нищото", () => {
  const r = validateHandoff(OK.replace("Към: izpitatelya", "Към: измисленджията"), opts);
  assert.ok(r.problems.some((p) => p.field === "Към" && /непознат адресат/.test(p.msg)));
});

test("човек е легитимен адресат (ескалацията е част от договора)", () => {
  for (const h of ["човек", "човека", "собственика", "потребителя"]) {
    const r = validateHandoff(OK.replace("Към: izpitatelya", `Към: ${h}`), opts);
    assert.deepEqual(r.problems, [], `„${h}" трябва да е валиден адресат`);
  }
});

// --- Форма на блока --------------------------------------------------------------

test("полетата на отделни редове (не слети с →) също се четат", () => {
  const split = `## ПРЕДАВАНЕ
От: prodavacha
Към: pravniyat-razbirach
Статус: наред
Изход/артефакт: checkout поток
Следваща стъпка: правен преглед на 14-дневния отказ`;
  const r = validateHandoff(split, opts);
  assert.deepEqual(r.problems, []);
  assert.equal(r.fields.from, "prodavacha");
  assert.equal(r.fields.to, "pravniyat-razbirach");
});

test("удебелени и булет-форматирани полета се приемат (агентите форматират различно)", () => {
  const fancy = `## ПРЕДАВАНЕ
- **От:** kodadjiyata → **Към:** izpitatelya
- **Статус:** наред
- **Изход/артефакт:** ревю
- **Следваща стъпка:** e2e`;
  assert.deepEqual(validateHandoff(fancy, opts).problems, []);
});

test("липсваща Следваща стъпка пада — веригата спира без указание", () => {
  const t = OK.split("\n").filter((l) => !l.startsWith("Следваща стъпка")).join("\n");
  assert.ok(validateHandoff(t, opts).problems.some((p) => p.field === "Следваща стъпка"));
});

test("при няколко блока се съди ПОСЛЕДНИЯТ (предаването е накрая)", () => {
  const two = `## ПРЕДАВАНЕ
От: kodadjiyata → Към: измисленджията
Статус: наред
Изход/артефакт: чернова
Следваща стъпка: преработка

Междинен текст.

${OK}`;
  assert.deepEqual(validateHandoff(two, opts).problems, [], "вторият (валиден) блок е меродавен");
});

test("extractBlock спира на следващото заглавие, не поглъща целия документ", () => {
  const b = extractBlock(`${OK}\n\n## Друга секция\nнеща`);
  assert.ok(b.includes("Следваща стъпка"));
  assert.ok(!b.includes("Друга секция"));
});
