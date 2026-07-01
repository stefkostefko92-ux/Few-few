import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocale, LOCALE_OG, LOCALE_LABEL, LOCALES } from "@/lib/locale";

test("parseLocale връща en само за 'en', иначе bg", () => {
  assert.equal(parseLocale("en"), "en");
  assert.equal(parseLocale("bg"), "bg");
  assert.equal(parseLocale(undefined), "bg");
  assert.equal(parseLocale("fr"), "bg");
  assert.equal(parseLocale(["en"]), "bg"); // масив не е валидна стойност
});

test("има точно две локали с етикети и OG стойности", () => {
  assert.deepEqual(LOCALES, ["bg", "en"]);
  assert.equal(LOCALE_OG.bg, "bg_BG");
  assert.equal(LOCALE_OG.en, "en_US");
  assert.ok(LOCALE_LABEL.bg && LOCALE_LABEL.en);
});
