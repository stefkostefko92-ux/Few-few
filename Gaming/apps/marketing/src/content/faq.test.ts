import { describe, expect, it } from "vitest";
import { SITE_FAQ } from "./faq";
import { siteFaqLd } from "../lib/jsonld";

describe("site-wide FAQ (AEO)", () => {
  it("has a healthy set of non-empty, unique questions", () => {
    expect(SITE_FAQ.length).toBeGreaterThanOrEqual(6);
    const seen = new Set<string>();
    for (const f of SITE_FAQ) {
      expect(f.question.trim().length).toBeGreaterThan(0);
      expect(f.answer.trim().length).toBeGreaterThan(0);
      expect(seen.has(f.question)).toBe(false);
      seen.add(f.question);
    }
  });

  it("keeps the §11.4 social-gaming stance (no real-money gambling)", () => {
    const joined = SITE_FAQ.map((f) => f.answer).join(" ");
    expect(joined).toMatch(/виртуални чипове/);
    expect(joined).toMatch(/18/);
  });

  it("builds a valid FAQPage JSON-LD shape", () => {
    const ld = siteFaqLd(SITE_FAQ);
    expect(ld["@type"]).toBe("FAQPage");
    expect(Array.isArray(ld.mainEntity)).toBe(true);
    expect((ld.mainEntity as unknown[]).length).toBe(SITE_FAQ.length);
  });
});
