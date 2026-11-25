import test from "node:test";
import assert from "node:assert/strict";
import {
  rankIndex,
  isWeakResult,
  hasWordPrefix,
  variants,
  prepareMissQuery,
  type SearchIndex,
} from "@/lib/search";

// Възпроизвежда реалните фалшиви съвпадения от живия сайт (23.10.2026):
// „работа“ → „Картата ми ще работи ли…“ и „Как да обработя малка рана“;
// „автобус до Дупница“ → „Какво да правя при спиране на тока?“.
const idx: SearchIndex = {
  faqs: [
    {
      slug: "rana",
      question: "Как да обработя малка рана",
      answer: "Измийте с вода и сапун, после обработете с антисептик.",
      tags: "първа помощ, рана",
      category: "Здраве",
    },
    {
      slug: "tok",
      question: "Какво да правя при спиране на тока?",
      answer: "Проверете таблото. Спирането може да е планирано от ЕРМ Запад.",
      tags: "ток, авария",
      category: "Комунални",
    },
    {
      slug: "karta",
      question: "Картата ми ще работи ли след 1 януари?",
      answer: "Да, банковите карти продължават да работят и след приемането на еврото.",
      tags: "евро, карта, банка",
      category: "Пари",
    },
    {
      slug: "avtobus",
      question: "Как да стигна с автобус до Дупница?",
      answer: "Автобусите тръгват от автогарата. Вижте разписанието.",
      tags: "транспорт, автобус, дупница",
      category: "Транспорт",
    },
  ],
  services: [],
  businesses: [],
  events: [],
};

test("съвпадението е само в началото на дума", () => {
  assert.equal(hasWordPrefix("как да обработя малка рана", "работ"), false);
  assert.equal(hasWordPrefix("ще работи ли", "работ"), true);
  assert.equal(hasWordPrefix("(аптека)", "аптек"), true);
  assert.equal(hasWordPrefix("", "x"), false);
});

test("стемът не пада под 5 знака, освен при членуване", () => {
  assert.deepEqual(variants("спирка"), ["спирка", "спирк"]);
  assert.deepEqual(variants("колата"), ["колата", "колат", "кола"]);
  assert.deepEqual(variants("автобуси"), ["автобуси", "автобус", "автобу"]);
  assert.deepEqual(variants("ток"), ["ток"]);
});

test("„работа“ вече не намира „обработя“", () => {
  const res = rankIndex(idx, "работа");
  assert.ok(!res.some((r) => r.url === "/kak-da/rana"), JSON.stringify(res));
});

test("„автобус до Дупница“ не намира „спиране на тока“", () => {
  const res = rankIndex(idx, "автобус до Дупница");
  assert.equal(res[0]?.url, "/kak-da/avtobus");
  assert.ok(!res.some((r) => r.url === "/kak-da/tok"));
  assert.equal(isWeakResult(res), false);
});

test("съвпадение само в текста е слабо → търсенето се отчита като неуспешно", () => {
  // „сапун“ го има само в отговора на една статия, не в заглавие/етикети.
  const res = rankIndex(idx, "сапун");
  assert.equal(res.length, 1);
  assert.equal(res[0].strong, false);
  assert.equal(isWeakResult(res), true);
  assert.equal(isWeakResult([]), true);
});

test("силно: понятието е в заглавието", () => {
  const res = rankIndex(idx, "спиране на тока");
  assert.equal(res[0].url, "/kak-da/tok");
  assert.equal(res[0].strong, true);
});

test("преди запис: маскиране на лични данни, малки букви, таван 200", () => {
  assert.equal(prepareMissQuery("Пенсия 4505051234"), "пенсия [ЕГН]");
  assert.equal(prepareMissQuery("Обадете се на 0888 123 456"), "обадете се на [телефон]");
  assert.equal(prepareMissQuery("4505051234"), null);
  assert.equal(prepareMissQuery(" а "), null);
  assert.ok((prepareMissQuery("я".repeat(5000)) ?? "").length <= 200);
  assert.ok(!/\d{6,}/.test(prepareMissQuery("иван ivan@abv.bg 0888123456 8001011234") ?? ""));
});
