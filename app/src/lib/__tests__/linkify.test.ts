import test from "node:test";
import assert from "node:assert/strict";
import { linkifySegments } from "@/lib/linkify";

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
  const segs = linkifySegments("Пишете на zadupnitsa@zadupnitsa.eu по всяко време.");
  const mail = segs.find((s) => s.kind === "mailto");
  assert.equal(mail!.href, "mailto:zadupnitsa@zadupnitsa.eu");
});

test("не вкарва връзки в обикновен текст (вкл. години)", () => {
  const segs = linkifySegments("Еврото идва през 2026 година.");
  assert.ok(segs.every((s) => s.kind === "text"));
  assert.equal(segs.map((s) => s.text).join(""), "Еврото идва през 2026 година.");
});
