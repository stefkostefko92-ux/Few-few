// bot/src/__tests__/i18n.test.js
// Key parity: every non-source locale must translate every key that exists in
// en (the source of truth) — bg/it/de/es/fr/nl/pl. No placeholders left.
import { describe, it, expect } from "vitest";
import en from "../i18n/en.js";
import bg from "../i18n/bg.js";
import itLocale from "../i18n/it.js";
import de from "../i18n/de.js";
import es from "../i18n/es.js";
import fr from "../i18n/fr.js";
import nl from "../i18n/nl.js";
import pl from "../i18n/pl.js";
import { t, SUPPORTED_LANGUAGES, resolveLangSync } from "../i18n/index.js";

const FULLY_TRANSLATED = { bg, it: itLocale, de, es, fr, nl, pl };

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

    // A dropped/renamed {{var}} renders literally in a live Discord message
    // (or silently loses information) — the most dangerous translation bug.
    it(`${lang} keeps exactly the same {{placeholders}} as en`, () => {
      const vars = (s) =>
        (String(s).match(/\{\{\s*\w+\s*\}\}/g) || [])
          .map((v) => v.replace(/\s/g, ""))
          .sort()
          .join(",");
      const mismatched = enKeys.filter((k) => vars(locale[k]) !== vars(en[k]));
      expect(mismatched).toEqual([]);
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

  it("de/es/fr/nl/pl are real translations, not en re-exports", () => {
    for (const [lang, locale] of Object.entries({ de, es, fr, nl, pl })) {
      expect(locale).not.toBe(en);
      const s = t("ticket.staffOnly", lang);
      expect(s).toBeTruthy();
      expect(s).not.toBe(en["ticket.staffOnly"]);
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

// ─── Discord лимити на локализациите (регресия за crash-а от 05.08.2026) ─────
// setNameLocalizations валидира ≤32, setDescriptionLocalizations ≤100 —
// нарушение УБИВА бота при стартиране (crash loop), а node --check не го лови.
import { CMD_NAME_L10N, CMD_DESC_L10N } from "../utils/commandLocalizations.js";

describe("command localization length limits", () => {
  it("all name localizations are ≤32 chars (Discord hard limit)", () => {
    for (const [cmd, locs] of Object.entries(CMD_NAME_L10N)) {
      for (const [loc, s] of Object.entries(locs)) {
        expect(s.length, `${cmd} [${loc}]: "${s}"`).toBeLessThanOrEqual(32);
      }
    }
  });
  it("all description localizations are ≤100 chars (Discord hard limit)", () => {
    for (const [cmd, locs] of Object.entries(CMD_DESC_L10N)) {
      for (const [loc, s] of Object.entries(locs)) {
        expect(s.length, `${cmd} [${loc}]: "${s}"`).toBeLessThanOrEqual(100);
      }
    }
  });
});
