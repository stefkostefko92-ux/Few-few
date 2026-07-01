import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLocale,
  availableLocales,
  resolveLocale,
  langAlternates,
  LOCALE_OG,
  LOCALE_LABEL,
  LOCALES,
} from "@/lib/locale";

test("parseLocale връща en/it иначе bg", () => {
  assert.equal(parseLocale("en"), "en");
  assert.equal(parseLocale("it"), "it");
  assert.equal(parseLocale("bg"), "bg");
  assert.equal(parseLocale(undefined), "bg");
  assert.equal(parseLocale("fr"), "bg");
  assert.equal(parseLocale(["en"]), "bg");
});

test("availableLocales: вторичен език само при включен И със съдържание", () => {
  assert.deepEqual(availableLocales({ localeEn: false, enCount: 5, localeIt: false, itCount: 5 }), ["bg"]);
  assert.deepEqual(availableLocales({ localeEn: true, enCount: 0, localeIt: false, itCount: 0 }), ["bg"]);
  assert.deepEqual(availableLocales({ localeEn: true, enCount: 3, localeIt: false, itCount: 0 }), ["bg", "en"]);
  assert.deepEqual(availableLocales({ localeEn: true, enCount: 3, localeIt: true, itCount: 2 }), ["bg", "en", "it"]);
});

test("resolveLocale: исканата ако е налична, иначе bg", () => {
  assert.equal(resolveLocale(["bg", "en"], "en"), "en");
  assert.equal(resolveLocale(["bg", "en"], "it"), "bg"); // it не е налична
  assert.equal(resolveLocale(["bg", "en", "it"], "it"), "it");
  assert.equal(resolveLocale(["bg"], "en"), "bg");
});

test("langAlternates: undefined при един език, иначе карта + x-default", () => {
  assert.equal(langAlternates("https://x/", ["bg"]), undefined);
  const m = langAlternates("https://x/p", ["bg", "en", "it"]);
  assert.equal(m?.bg, "https://x/p");
  assert.equal(m?.en, "https://x/p?lang=en");
  assert.equal(m?.it, "https://x/p?lang=it");
  assert.equal(m?.["x-default"], "https://x/p");
});

test("има три локали с етикети и OG стойности", () => {
  assert.deepEqual(LOCALES, ["bg", "en", "it"]);
  assert.equal(LOCALE_OG.it, "it_IT");
  assert.ok(LOCALE_LABEL.bg && LOCALE_LABEL.en && LOCALE_LABEL.it);
});
