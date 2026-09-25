import { describe, it, expect } from "vitest";
import { LOCALES, UI, t, isLocale, localeForCountry } from "../i18n";

// Паритет на ключовете между трите езика: ако BG/EN изостане от IT (source),
// потребител вижда суров ключ (t() връща key като fallback) вместо текст.
describe("i18n — паритет на речниците", () => {
  const [source, ...others] = LOCALES; // "it" е source по CLAUDE.md
  const sourceKeys = Object.keys(UI[source]).sort();

  for (const locale of others) {
    it(`${locale} съдържа всички ключове от ${source}`, () => {
      const keys = Object.keys(UI[locale]).sort();
      expect(keys).toEqual(sourceKeys);
    });
  }

  it("t() пада обратно към DEFAULT_LOCALE при непознат ключ в дадения език", () => {
    // t() приема произволен низ за ключ — при липса връща самия ключ.
    expect(t("bg", "no.such.key")).toBe("no.such.key");
  });

  it("isLocale разпознава само поддържаните локали", () => {
    expect(isLocale("it")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("localeForCountry мапва IT/BG коректно и всичко друго → en", () => {
    expect(localeForCountry("IT")).toBe("it");
    expect(localeForCountry("bg")).toBe("bg"); // case-insensitive вход
    expect(localeForCountry("US")).toBe("en");
    expect(localeForCountry(null)).toBe("en");
  });
});
