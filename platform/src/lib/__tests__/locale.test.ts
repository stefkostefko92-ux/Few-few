import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocale, localeState, LOCALE_OG, LOCALE_LABEL, LOCALES } from "@/lib/locale";

test("parseLocale връща en само за 'en', иначе bg", () => {
  assert.equal(parseLocale("en"), "en");
  assert.equal(parseLocale("bg"), "bg");
  assert.equal(parseLocale(undefined), "bg");
  assert.equal(parseLocale("fr"), "bg");
  assert.equal(parseLocale(["en"]), "bg"); // масив не е валидна стойност
});

test("localeState: EN се показва само при включен сайт И налично EN съдържание", () => {
  // сайтът няма EN → винаги bg, без switcher
  assert.deepEqual(localeState(false, "en", 5), { locale: "bg", showEn: false });
  // сайтът има EN, но страницата е с празни EN блокове → не рекламираме EN
  assert.deepEqual(localeState(true, "en", 0), { locale: "bg", showEn: false });
  // сайтът има EN и има EN съдържание → EN активна
  assert.deepEqual(localeState(true, "en", 3), { locale: "en", showEn: true });
  // EN налична, но заявката е bg → bg активна, switcher се показва
  assert.deepEqual(localeState(true, undefined, 3), { locale: "bg", showEn: true });
});

test("има точно две локали с етикети и OG стойности", () => {
  assert.deepEqual(LOCALES, ["bg", "en"]);
  assert.equal(LOCALE_OG.bg, "bg_BG");
  assert.equal(LOCALE_OG.en, "en_US");
  assert.ok(LOCALE_LABEL.bg && LOCALE_LABEL.en);
});
