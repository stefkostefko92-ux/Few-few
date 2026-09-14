// source-parity.test.mjs — ЕДНА дефиниция за „източник", не две.
//
// Дефектът: `sourceIsReal` (куката — решава дали поука става ФАКТ) беше по-строга от `hasSource`
// (одиторът — после я преглежда). За 74 реални поуки двете даваха различен отговор, затова
// напълно валидни знания заседнаха в Карантина завинаги: правни цитати с домейн без схема
// (`tita.bg/laws/427`), репо-пътища без номер на ред, `discord.com/developers/docs`.
// Две дефиниции за едно понятие произвеждат тих отпад — тестът ги държи изравнени.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceIsReal } from "../../.claude/hooks/memory-capture.mjs";
import { hasSource } from "../agents/oversee-lib.mjs";

// Реални низове, извадени от Карантината — всеки е ИСТИНСКИ, проверим източник.
const РЕАЛНИ = [
  "чл.6, ал.1, т.1 Закон за счетоводството (само арабски цифри) / tita.bg/laws/427",
  "за жива проверка discord.com/developers/docs Monetization",
  "SupremeDiscordBot/bot/src/utils/serverEventLog.js + events/voiceStateUpdate.js",
  "https://docs.stripe.com/webhooks",
  "tools/agents/gate.mjs:42",
  "Прил. № 29, т. 10 от Наредба Н-18",
  "чл. 31, ал. 2 Наредба Н-18",
  "developer.mozilla.org/en-US/docs/Web/API",
];

// Празнота — тук няма какво да се провери; ТРЯБВА да остане отхвърлена.
const ПРАЗНИ = ["N/A", "n/a", "само коефициенти налични", "", "   ", "—", "-", "няма"];

test("реален източник минава през куката (иначе знанието умира в Карантина)", () => {
  for (const s of РЕАЛНИ) assert.equal(sourceIsReal(s), true, `трябва да мине: ${s}`);
});

test("празният източник НЕ минава (законът „източник или нищо“ остава)", () => {
  for (const s of ПРАЗНИ) assert.equal(sourceIsReal(s), false, `не бива да мине: ${JSON.stringify(s)}`);
});

test("куката и одиторът се съгласяват за реалните източници", () => {
  for (const s of РЕАЛНИ) {
    const hook = sourceIsReal(s), audit = hasSource(s);
    assert.equal(hook, audit, `разминаване за „${s}“: кука=${hook} одитор=${audit}`);
  }
});

test("куката и одиторът се съгласяват и за празнотата", () => {
  for (const s of ПРАЗНИ) {
    assert.equal(sourceIsReal(s), false);
    assert.equal(hasSource(s), false, `одиторът също трябва да отхвърли „${s}“`);
  }
});

test("нищо от доктрината не се разхлабва: гол текст без препратка пада", () => {
  for (const s of ["защото така мисля", "общоизвестно е", "виж документацията"])
    assert.equal(sourceIsReal(s), false, `не бива да мине: ${s}`);
});

test("undefined/null не чупят предиката", () => {
  assert.equal(sourceIsReal(undefined), false);
  assert.equal(sourceIsReal(null), false);
});
