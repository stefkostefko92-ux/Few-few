import test from "node:test";
import assert from "node:assert/strict";
import { fixBgTypography } from "../bg-typography";

test("кавички: правите двойни стават „ … “ по двойки", () => {
  assert.equal(fixBgTypography('той каза "здравей" на всички'), "той каза „здравей“ на всички");
});

test("многоточие: три и повече точки → …", () => {
  assert.equal(fixBgTypography("чакай.... идвам"), "чакай… идвам");
});

test("тирета: -- → —, ' - ' → ' – '", () => {
  assert.equal(fixBgTypography("едно -- две"), "едно — две");
  assert.equal(fixBgTypography("едно - две"), "едно – две");
});

test("интервали: свива поредни и маха преди пунктуация", () => {
  assert.equal(fixBgTypography("много    интервали , тук"), "много интервали, тук");
});

test("не пипа новите редове", () => {
  assert.equal(fixBgTypography("ред1\nред2"), "ред1\nред2");
});
