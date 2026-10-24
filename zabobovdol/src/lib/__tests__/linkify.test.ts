import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STEP_LINKIFY, linkifySegments } from "@/lib/linkify";

test("прави дълъг телефон кликаем (tel:) без интервалите", () => {
  const segs = linkifySegments("Обадете се на 0877 414 874 за справка.");
  const tel = segs.find((s) => s.kind === "tel");
  assert.ok(tel, "трябва да има телефонен сегмент");
  assert.equal(tel!.href, "tel:0877414874");
  assert.equal(tel!.text, "0877 414 874");
});

test("разпознава международен формат +359", () => {
  const segs = linkifySegments("Тел.: +359 877 414 874");
  const tel = segs.find((s) => s.kind === "tel");
  assert.equal(tel!.href, "tel:+359877414874");
});

test("краткият спешен номер 112 става кликаем", () => {
  const segs = linkifySegments("При спешност звъннете на 112 веднага.");
  const tel = segs.find((s) => s.kind === "tel");
  assert.equal(tel!.href, "tel:112");
});

test("имейлът става mailto:", () => {
  const segs = linkifySegments("Пишете на zabobovdol@carbonstealth.eu по всяко време.");
  const mail = segs.find((s) => s.kind === "mailto");
  assert.equal(mail!.href, "mailto:zabobovdol@carbonstealth.eu");
});

test("не вкарва връзки в обикновен текст (вкл. години)", () => {
  const segs = linkifySegments("Еврото идва през 2026 година.");
  assert.ok(segs.every((s) => s.kind === "text"));
  assert.equal(segs.map((s) => s.text).join(""), "Еврото идва през 2026 година.");
});

// --- Кратките номера само като отделна „дума“ (регресия от стъпките) ---

const links = (text: string, opts?: Parameters<typeof linkifySegments>[1]) =>
  linkifySegments(text, opts).filter((s) => s.kind !== "text");

test("адресът „112.mvr.bg“ не е телефон", () => {
  assert.deepEqual(links("Влезте на официалния сайт 112.mvr.bg."), []);
  assert.deepEqual(links("Влезте на официалния сайт 112.mvr.bg.", STEP_LINKIFY), []);
});

test("диапазон и мярка („130–150 г.“, „150 г“, „160 °C“) не са телефон", () => {
  assert.deepEqual(links("Чаша брашно ≈ 130–150 г."), []);
  assert.deepEqual(links("Чаша брашно ≈ 130 - 150 г."), []);
  assert.deepEqual(links("Около 150 г захар."), []);
  assert.deepEqual(links("Печете на 160 °C."), []);
  assert.deepEqual(links("Печете на 160 градуса."), []);
});

test("краткият номер в края на изречението, след „:“ и в скоби остава връзка", () => {
  assert.equal(links("Звъннете на 112.")[0]?.href, "tel:112");
  assert.equal(links("На 112: болка в гърдите.")[0]?.href, "tel:112");
  assert.equal(links("Важни телефони (112, личен лекар).")[0]?.href, "tel:112");
  assert.equal(links("Обадете се на 166 веднага.")[0]?.href, "tel:166");
});

test("стъпките: имейлите не са връзки, от кратките — само 112", () => {
  assert.deepEqual(links("Пример: ime.familia@gmail.com", STEP_LINKIFY), []);
  assert.deepEqual(links("Обадете се на 150.", STEP_LINKIFY), []);
  const tel = links("Звъннете на 112 и кажете точния адрес.", STEP_LINKIFY);
  assert.equal(tel.length, 1);
  assert.equal(tel[0].href, "tel:112");
  // Дългите телефони остават връзки.
  assert.equal(links("Обадете се на 0702 6 23 23.", STEP_LINKIFY)[0]?.href, "tel:070262323");
});

test("текстът се запазва дословно, каквито и да са опциите", () => {
  const s = "Сайт 112.mvr.bg, имейл ime.familia@gmail.com, тел. 0877 414 874 и 112.";
  for (const opts of [undefined, STEP_LINKIFY, { short: "none" as const }]) {
    assert.equal(
      linkifySegments(s, opts)
        .map((x) => x.text)
        .join(""),
      s,
    );
  }
});

test("без lookbehind — linkify работи и в браузъра (чата) на Safari под 16.4", () => {
  const code = readFileSync(join(process.cwd(), "src/lib/linkify.ts"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  assert.equal(/\(\?<[!=]/.test(code), false);
});
