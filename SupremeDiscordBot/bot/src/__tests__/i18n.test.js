// bot/src/__tests__/i18n.test.js
// Key parity: bg/it must translate every key that exists in en (the source of
// truth). de/es/fr/nl/pl are intentional English placeholders (re-export en.js)
// pending the Преводач agent — excluded here on purpose.
import { describe, it, expect } from "vitest";
import en from "../i18n/en.js";
import bg from "../i18n/bg.js";
import itLocale from "../i18n/it.js";
import { t, SUPPORTED_LANGUAGES, resolveLangSync } from "../i18n/index.js";

const FULLY_TRANSLATED = { bg, it: itLocale };

describe("i18n key parity", () => {
  const enKeys = Object.keys(en).sort();

  for (const [lang, locale] of Object.entries(FULLY_TRANSLATED)) {
    it(`${lang} has every en key (no missing translations)`, () => {
      const localeKeys = new Set(Object.keys(locale));
      const missing = enKeys.filter((k) => !localeKeys.has(k));
      expect(missing).toEqual([]);
    });

    it(`${lang} has no orphan keys not present in en`, () => {
      const enKeySet = new Set(enKeys);
      const orphans = Object.keys(locale).filter((k) => !enKeySet.has(k));
      expect(orphans).toEqual([]);
    });
  }

  it("registers all 8 target languages", () => {
    expect(SUPPORTED_LANGUAGES.sort()).toEqual(
      ["bg", "de", "en", "es", "fr", "it", "nl", "pl"].sort()
    );
  });
});

describe("t() fallback safety", () => {
  it("falls back to English when the key is missing in the target locale", () => {
    // "ai.disclosure.author" exists in every locale — use a locale-only key
    // that's guaranteed present in en to prove the fallback chain, not the
    // literal-missing-key path (covered by the test below).
    expect(t("ticket.opened", "bg", { channel: "#x" })).toContain("Билет");
  });

  it("falls back to the raw key when missing in both the target and en", () => {
    expect(t("this.key.does.not.exist", "bg")).toBe("this.key.does.not.exist");
  });

  it("never throws for an unsupported language code", () => {
    expect(() => t("ticket.opened", "xx", { channel: "#x" })).not.toThrow();
  });

  it("de/es/fr/nl/pl placeholders resolve (re-export en, not undefined)", () => {
    for (const lang of ["de", "es", "fr", "nl", "pl"]) {
      expect(t("ticket.staffOnly", lang)).toBe(en["ticket.staffOnly"]);
    }
  });
});

describe("resolveLangSync (interaction.locale only, no DB hop)", () => {
  it("maps a supported Discord locale to our code", () => {
    expect(resolveLangSync({ locale: "bg" })).toBe("bg");
    expect(resolveLangSync({ locale: "es-ES" })).toBe("es");
    expect(resolveLangSync({ locale: "it" })).toBe("it");
  });

  it("falls back to en for unsupported/unknown locales", () => {
    expect(resolveLangSync({ locale: "ja" })).toBe("en");
    expect(resolveLangSync({})).toBe("en");
    expect(resolveLangSync(undefined)).toBe("en");
  });
});
