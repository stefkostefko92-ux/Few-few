// promote.test.mjs — пътят Карантина → „Проверени поуки“ е ЕДИНСТВЕН и не може да подменя факт.
//
// Инструментът е нов (Кръг 13) и е най-опасният в паметта: каквото промотира, се инжектира в агента
// при ВСЕКИ старт, завинаги. Затова тестовете пазят преди всичко ГРАНИЦИТЕ, не щастливия път:
//   · текстът идва от ФАЙЛА, не от вердикта (агент не може да подмени съдържание през този канал);
//   · „потвърдена“ без реален източник се ОТКАЗВА (иначе пресверяването е самооценка);
//   · непознат lid → отказ (fail-closed), а не тихо пропускане;
//   · опровергана НЕ се трие (опровержението е знание);
//   · нищо не се записва, ако ПОНЕ ЕДИН вердикт е невалиден (всичко или нищо — да няма полу-състояние).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyVerdicts, promoteBullet, refuteBullet, splitTail } from "./promote.mjs";
import { lessonId } from "./quarantine-review.mjs";

const TODAY = "2026-08-04";
const Q1 = '- **2026-07-24:** Meta Advanced Access иска App Review на всяко permission поотделно. _(платформени политики; unverified; https://developers.facebook.com/docs/graph-api/overview/access-levels/)_';
const Q2 = '- **2026-07-16:** Точните такси по Apple EU DMA са подвижни към средата на 2026. _(магазини; unverified; https://developer.apple.com/support/dma-and-apps-in-the-eu/)_';
const V1 = '- **2026-08-01:** Вече проверена поука. _(обхват; verified; https://example.org/a)_';

const mem = (q = [Q1, Q2], v = [V1]) =>
  `# памет\n\n## Проверени поуки (verified)\n\n${v.join("\n")}\n\n## Карантина (непроверени — НЕ са факт)\n\n${q.join("\n")}\n`;

test("splitTail: разчита обхват/увереност/източник, дори когато обхватът има скоби", () => {
  const t = splitTail('- **2026-07-29:** нещо _(реален одит (измерени числа); unverified; https://a.bg/x)_');
  assert.deepEqual(t, { scope: "реален одит (измерени числа)", confidence: "unverified", source: "https://a.bg/x" });
});

test("промоцията сменя САМО увереността, източника и датовия маркер — тялото е дословно", () => {
  const out = promoteBullet(Q1, "https://developers.facebook.com/docs/graph-api/overview/access-levels/", TODAY);
  assert.match(out, /Meta Advanced Access иска App Review на всяко permission поотделно\./, "тялото не бива да се променя");
  assert.match(out, /; verified; /);
  assert.match(out, /\*\*2026-07-24 \(пресверена 2026-08-04\):\*\*/);
  assert.doesNotMatch(out, /unverified/);
});

test("промоцията е идемпотентна по датовия маркер (не трупа „(пресверена …)“ на всеки пуск)", () => {
  const once = promoteBullet(Q1, "https://example.org/a", TODAY);
  const twice = promoteBullet(once, "https://example.org/a", "2026-09-01");
  assert.equal((twice.match(/пресверена/g) || []).length, 1, "маркерът се ПОДМЕНЯ, не се натрупва");
  assert.match(twice, /\(пресверена 2026-09-01\)/);
});

test("ТЕКСТЪТ идва от файла, не от вердикта (каналът не може да подменя факт)", () => {
  const r = applyVerdicts(mem(), [{
    lid: lessonId(Q1), verdict: "потвърдена", source: "https://developers.facebook.com/docs/graph-api/overview/access-levels/",
    text: "ЗЛОНАМЕРЕНА ПОДМЯНА: Advanced Access не иска ревю.",   // вердиктът се опитва да пренапише
  }], TODAY);
  assert.ok(!r.error, r.error);
  assert.doesNotMatch(r.md, /ЗЛОНАМЕРЕНА ПОДМЯНА/, "полето `text` във вердикта трябва да се ИГНОРИРА");
  assert.match(r.md, /Meta Advanced Access иска App Review/);
});

test("„потвърдена“ без реален източник се ОТКАЗВА (пресверяването не е самооценка)", () => {
  const r = applyVerdicts(mem(), [{ lid: lessonId(Q1), verdict: "потвърдена", source: "проверих го" }], TODAY);
  assert.ok(r.error, "трябва да откаже");
  assert.match(r.error, /без реален източник/);
});

test("непознат lid → отказ, не тихо пропускане (fail-closed)", () => {
  const r = applyVerdicts(mem(), [{ lid: "deadbeef", verdict: "остава" }], TODAY);
  assert.ok(r.error);
  assert.match(r.error, /няма такава поука/);
});

test("един невалиден вердикт спира ЦЕЛИЯ запис (без полу-приложено състояние)", () => {
  const r = applyVerdicts(mem(), [
    { lid: lessonId(Q1), verdict: "потвърдена", source: "https://developers.facebook.com/docs/graph-api/overview/access-levels/" },
    { lid: "deadbeef", verdict: "потвърдена", source: "https://example.org/a" },
  ], TODAY);
  assert.ok(r.error, "трябва да откаже целия пакет");
  assert.equal(r.md, undefined, "нищо не се връща за запис");
});

test("опровергана ОСТАВА в Карантина, маркирана — не се трие", () => {
  const r = applyVerdicts(mem(), [{ lid: lessonId(Q2), verdict: "опровергана", note: "Apple смени схемата 2026-08" }], TODAY);
  assert.ok(!r.error, r.error);
  const quar = r.md.split(/^##\s*Карантина/m)[1];
  assert.match(quar, /ОПРОВЕРГАНА 2026-08-04 \(Apple смени схемата 2026-08\)/);
  assert.match(quar, /Точните такси по Apple EU DMA/, "съдържанието остава");
});

test("refuteBullet е идемпотентен (повторен пуск не трупа маркери)", () => {
  const once = refuteBullet(Q2, "бележка", TODAY);
  assert.equal(refuteBullet(once, "бележка", "2026-09-01"), once);
});

test("промотираната поука напуска Карантина и влиза в ПРОВЕРЕНИТЕ", () => {
  const r = applyVerdicts(mem(), [{
    lid: lessonId(Q1), verdict: "потвърдена",
    source: "https://developers.facebook.com/docs/graph-api/overview/access-levels/",
  }], TODAY);
  assert.ok(!r.error, r.error);
  const [ver, quar] = [r.md.split(/^##\s*Карантина/m)[0], r.md.split(/^##\s*Карантина/m)[1]];
  assert.match(ver, /Meta Advanced Access/, "трябва да е в Проверени поуки");
  assert.doesNotMatch(quar, /Meta Advanced Access/, "и да е напуснала Карантина");
  assert.match(ver, /Вече проверена поука/, "съществуващите проверени поуки остават");
  assert.match(quar, /Точните такси по Apple EU DMA/, "непипнатите карантинирани остават");
});

test("„остава“ не променя нищо", () => {
  const before = mem();
  const r = applyVerdicts(before, [{ lid: lessonId(Q1), verdict: "остава" }], TODAY);
  assert.ok(!r.error, r.error);
  assert.equal(r.md.replace(/\n+/g, "\n"), before.replace(/\n+/g, "\n"));
});
