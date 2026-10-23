import test from "node:test";
import assert from "node:assert/strict";
import { maskPii, hasContentAfterMask, looksLikePii } from "@/lib/pii";

test("ЕГН (10 цифри) → [ЕГН]", () => {
  assert.equal(maskPii("пенсия 4505051234"), "пенсия [ЕГН]");
  assert.equal(maskPii("егн 8001011234 иван"), "егн [ЕГН] иван");
});

test("телефони: 08x, +359, 00359, стационарен, с разделители", () => {
  assert.equal(maskPii("обадете се 0888123456"), "обадете се [телефон]");
  assert.equal(maskPii("0888 123 456 спешно"), "[телефон] спешно");
  assert.equal(maskPii("тел. 088-812-3456"), "тел. [телефон]");
  assert.equal(maskPii("+359 888 123 456"), "[телефон]");
  assert.equal(maskPii("+359888123456"), "[телефон]");
  assert.equal(maskPii("00359 88 812 3456"), "[телефон]");
  assert.equal(maskPii("кметство 0702 12345"), "кметство [телефон]");
});

test("имейли, URL и IBAN", () => {
  assert.equal(maskPii("пиши на ivan.petrov@abv.bg моля"), "пиши на [имейл] моля");
  assert.equal(maskPii("иван@поща.бг"), "[имейл]");
  assert.equal(maskPii("виж https://example.com/a?x=1 тук"), "виж [адрес] тук");
  assert.equal(maskPii("www.site.bg/путь"), "[адрес]");
  assert.equal(maskPii("сметка BG80BNBG96611020345678"), "сметка [IBAN]");
  assert.equal(maskPii("сметка BG80 BNBG 9661 1020 3456 78"), "сметка [IBAN]");
});

test("други дълги поредици от цифри (6+), вкл. дата на раждане", () => {
  assert.equal(maskPii("договор 123456"), "договор [цифри]");
  assert.equal(maskPii("роден 12.05.1950"), "роден [цифри]");
  assert.equal(maskPii("клиентски номер 300 123 456 789"), "клиентски номер [цифри]");
});

test("обикновените търсения остават непокътнати", () => {
  for (const q of [
    "дежурна аптека",
    "данък сгради 2026",
    "автобус до дупница в 7 30",
    "пощенски код 2670",
    "ул. васил левски 12",
    "covid-19",
  ]) {
    assert.equal(maskPii(q), q, q);
  }
});

test("невидими знаци не крият цифрите", () => {
  assert.equal(maskPii("45​05051234"), "[цифри]");
  assert.equal(maskPii("егн 88­01011234"), "егн [цифри]");
});

test("остава ли смислен текст след маскиране", () => {
  assert.equal(hasContentAfterMask("[ЕГН]"), false);
  assert.equal(hasContentAfterMask("[телефон] [имейл]"), false);
  assert.equal(hasContentAfterMask("пенсия [ЕГН]"), true);
});

test("самопроверка: след маскиране няма нищо за маскиране", () => {
  const samples = [
    "пенсия 4505051234 0888123456 ivan@abv.bg BG80BNBG96611020345678 https://x.bg",
    "+359 2 123 4567 и 12.05.1950",
  ];
  for (const s of samples) {
    assert.equal(looksLikePii(s), true);
    assert.equal(looksLikePii(maskPii(s)), false);
    assert.ok(!/\d{6,}/.test(maskPii(s).replace(/\D/g, "")), maskPii(s));
  }
});
