import { describe, expect, it } from "vitest";
import { LOCALES } from "../i18n/locales";
import { KEYWORDS } from "./seo";

describe("meta keywords", () => {
  it.each(LOCALES)("%s: at least 5, one is always Carbon Stealth (repo rule)", (locale) => {
    expect(KEYWORDS[locale].length).toBeGreaterThanOrEqual(5);
    expect(KEYWORDS[locale]).toContain("Carbon Stealth");
  });

  it("EN and IT are in their own language, not the Bulgarian list", () => {
    for (const locale of LOCALES.filter((l) => l !== "bg")) {
      for (const k of KEYWORDS[locale]) expect(k, `${locale}: ${k}`).not.toMatch(/[а-яё]/i);
    }
  });

  it("no keyword for Texas Hold'em: HOLDEM is retired from the roster", () => {
    for (const locale of LOCALES) {
      for (const k of KEYWORDS[locale]) expect(k).not.toMatch(/hold.?em|холдем/i);
    }
  });
});
