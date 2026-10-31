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
import { lessonId, reviewAgent } from "./quarantine-review.mjs";

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

// ── Пресверка на ПРОВЕРЕНИ поуки (2026-10-24) ─────────────────────────────────
// Пътят съществуваше само за Карантината; просрочена проверена поука нямаше как да се пресвери,
// без да се запише наново като почти-дубликат.
const V2 = '- **2026-05-01:** medqr/src/app.js:10 слага CSP с nonce. _(наш код; verified; medqr/src/app.js:10)_';
const V3 = '- **2026-05-02:** Apple иска X. _(магазини; verified; https://developer.apple.com/x; re-verify: 2026-12-01)_';

test("потвърдена ПРОВЕРЕНА поука остава на мястото си с маркер и живия източник", () => {
  const r = applyVerdicts(mem([Q1], [V1, V2]), [{ lid: lessonId(V2), verdict: "потвърдена", source: "medqr/src/app.js:12" }], TODAY);
  assert.ok(!r.error, r.error);
  const ver = r.md.split(/^##\s*Карантина/m)[0];
  assert.match(ver, /\*\*2026-05-01 \(пресверена 2026-08-04\):\*\* medqr\/src\/app\.js:10 слага CSP с nonce\./, "тялото дословно");
  assert.match(ver, /; verified; medqr\/src\/app\.js:12\)_/);
  assert.ok(ver.indexOf("Вече проверена") < ver.indexOf("CSP с nonce"), "редът в секцията не мърда");
  assert.deepEqual(r.reverified, [lessonId(V2)]);
});

test("опровергана ПРОВЕРЕНА поука се сваля в Карантина — само с бележка, без триене", () => {
  const bare = applyVerdicts(mem([Q1], [V1, V2]), [{ lid: lessonId(V2), verdict: "опровергана" }], TODAY);
  assert.match(bare.error || "", /само с бележка/, "без причина → отказ");
  const r = applyVerdicts(mem([Q1], [V1, V2]), [{ lid: lessonId(V2), verdict: "опровергана", note: "CSP вече е в helmet" }], TODAY);
  assert.ok(!r.error, r.error);
  const [ver, quar] = r.md.split(/^##\s*Карантина/m);
  assert.doesNotMatch(ver, /CSP с nonce/, "не се инжектира повече");
  assert.match(quar, /ОПРОВЕРГАНА 2026-08-04 \(CSP вече е в helmet\) — medqr\/src\/app\.js:10 слага CSP с nonce\./);
  assert.match(quar, /; unverified; medqr\/src\/app\.js:10\)_/, "не твърди за себе си, че е проверена");
});

test("бъдещ изричен срок се пази при пресверка; next го подменя; невалиден next → отказ", () => {
  const keep = applyVerdicts(mem([Q1], [V3]), [{ lid: lessonId(V3), verdict: "потвърдена", source: "https://developer.apple.com/y" }], TODAY);
  assert.match(keep.md, /https:\/\/developer\.apple\.com\/y; re-verify: 2026-12-01\)_/);
  const nx = applyVerdicts(mem([Q1], [V3]), [{ lid: lessonId(V3), verdict: "потвърдена", source: "https://developer.apple.com/y", next: "2027-02-01" }], TODAY);
  assert.match(nx.md, /re-verify: 2027-02-01\)_/);
  assert.doesNotMatch(nx.md, /2026-12-01/);
  const bad = applyVerdicts(mem([Q1], [V3]), [{ lid: lessonId(V3), verdict: "потвърдена", source: "https://developer.apple.com/y", next: "2020-01-01" }], TODAY);
  assert.match(bad.error || "", /бъдеща дата/);
});

test("минал изричен срок се изпълнява с пресверката (не остава вечно просрочен)", () => {
  const past = '- **2026-05-02:** Apple иска Z. _(магазини; verified; https://developer.apple.com/z; re-verify: 2026-07-01)_';
  const r = applyVerdicts(mem([Q1], [past]), [{ lid: lessonId(past), verdict: "потвърдена", source: "https://developer.apple.com/z" }], TODAY);
  assert.ok(!r.error, r.error);
  assert.doesNotMatch(r.md, /re-verify: 2026-07-01/);
});

test("опровергана поука е РЕШЕНА — прегледът не я предлага отново за пресверка", () => {
  const r = applyVerdicts(mem(), [{ lid: lessonId(Q2), verdict: "опровергана", note: "Apple смени схемата" }], TODAY);
  const rev = reviewAgent("x", r.md);
  assert.equal(rev.refuted, 1);
  assert.ok(!rev.candidates.some((c) => /Apple EU DMA/.test(c.text)), "решената не е кандидат");
  assert.ok(rev.candidates.some((c) => /Meta Advanced Access/.test(c.text)), "нерешената остава кандидат");
});

test("пресверка на поука в стар формат (без опашка) добавя стандартна опашка; тялото е дословно", () => {
  const OLD = '- **2026-06-26:** `tools/x.mjs` има `--creative` флаг. (Източник: собствен инструмент.)';
  const r = applyVerdicts(mem([Q1], [OLD]), [{ lid: lessonId(OLD), verdict: "потвърдена", source: "tools/x.mjs:16,71" }], TODAY);
  assert.ok(!r.error, r.error);
  assert.match(r.md, /\*\*2026-06-26 \(пресверена 2026-08-04\):\*\* `tools\/x\.mjs` има `--creative` флаг\. \(Източник: собствен инструмент\.\) _\(общо; verified; tools\/x\.mjs:16,71\)_/);
  const broken = '- **2026-06-26:** нещо _(само-една-част)_';
  assert.match(applyVerdicts(mem([Q1], [broken]), [{ lid: lessonId(broken), verdict: "потвърдена", source: "tools/x.mjs:1" }], TODAY).error || "", /не мога да разчета/, "счупена опашка → не гадай");
});

// ── 31.10.2026: „дубъл“ и „премести“ (курирането след вълната за обхвата) ──
const VD = [
  "# x", "", "## Проверени поуки",
  "- **2026-08-01:** Глобален таван на вход преди паролата е DoS. _(lockout при вход; verified; src/a.ts:1)_",
  "- **2026-08-01:** Глобален таван на вход пред паролата е DoS на собственика. _(брояч при вход; verified; src/a.ts:1)_",
  "- **2026-07-25:** restic forget и prune са отделни стъпки. _(ротация на бекъпи с restic; verified; https://restic.readthedocs.io/)_",
  "", "## Карантина", "",
].join("\n");
const lidOf = (re) => lessonId(VD.split("\n").find((l) => re.test(l)).trim());

test("дубъл: сваля повторението в Карантина с маркер ДУБЪЛ на <lid>, оригиналът остава", () => {
  const keep = lidOf(/преди паролата/), dup = lidOf(/пред паролата/);
  const r = applyVerdicts(VD, [{ lid: dup, verdict: "дубъл", of: keep }], TODAY);
  assert.ok(!r.error, r.error);
  const [ver, quar] = r.md.split("## Карантина");
  assert.match(ver, /преди паролата е DoS/);
  assert.doesNotMatch(ver, /пред паролата е DoS/);
  assert.match(quar, new RegExp(`ДУБЪЛ на ${keep} ${TODAY} — Глобален таван на вход пред паролата.*_\\(брояч при вход; unverified; src/a\\.ts:1\\)_`));
  assert.deepEqual(r.duplicates, [dup]);
});

test("дубъл: отказва без of, of = самата поука, непознат of или of, който също се сваля", () => {
  const a = lidOf(/преди паролата/), b = lidOf(/пред паролата/);
  for (const v of [
    [{ lid: b, verdict: "дубъл" }],
    [{ lid: b, verdict: "дубъл", of: b }],
    [{ lid: b, verdict: "дубъл", of: "deadbeef" }],
    [{ lid: b, verdict: "дубъл", of: a }, { lid: a, verdict: "опровергана", note: "x" }],
  ]) assert.ok(applyVerdicts(VD, v, TODAY).error, JSON.stringify(v));
});

test("премести: сваля с маркер ПРЕМЕСТЕНА при <агент> и връща реда за целевата памет", () => {
  const id = lidOf(/restic/);
  const r = applyVerdicts(VD, [{ lid: id, verdict: "премести", to: "vps-adjiyata", note: "домейн на VPS-аджията" }], TODAY, { self: "konveyera", agents: new Set(["vps-adjiyata", "konveyera"]) });
  assert.ok(!r.error, r.error);
  assert.match(r.md.split("## Карантина")[1], /ПРЕМЕСТЕНА при vps-adjiyata 2026-08-04 \(домейн на VPS-аджията\) — restic/);
  assert.equal(r.moved.length, 1);
  assert.equal(r.moved[0].to, "vps-adjiyata");
  assert.match(r.moved[0].line, /^- \*\*2026-07-25 \(преместено от konveyera 2026-08-04\):\*\* restic forget .*; verified; https:\/\/restic/);
});

test("премести: отказва непознат агент или към себе си", () => {
  const id = lidOf(/restic/);
  const ctx = { self: "konveyera", agents: new Set(["vps-adjiyata", "konveyera"]) };
  assert.ok(applyVerdicts(VD, [{ lid: id, verdict: "премести", to: "nikoy" }], TODAY, ctx).error);
  assert.ok(applyVerdicts(VD, [{ lid: id, verdict: "премести", to: "konveyera" }], TODAY, ctx).error);
});

test("insertVerified: преместената поука влиза най-горе в „Проверени поуки“ на целта", async () => {
  const { insertVerified } = await import("./promote.mjs");
  const target = ["# vps", "", "## Проверени поуки", "- **2026-01-01:** стара _(x y; verified; a:1)_", "", "## Карантина", ""].join("\n");
  const out = insertVerified(target, ["- **2026-07-25 (преместено от konveyera 2026-08-04):** restic _(ротация на бекъпи с restic; verified; https://restic.readthedocs.io/)_"]);
  const ver = out.split("## Карантина")[0];
  assert.ok(ver.indexOf("restic") < ver.indexOf("стара"));
});
