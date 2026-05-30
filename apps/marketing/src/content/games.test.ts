import { describe, expect, it } from "vitest";
import { isGameKey } from "@aso/shared";
import { GAME_CONTENT, getGameContent } from "./games";
import { faqLd, howToLd, videoGameLd } from "../lib/jsonld";

describe("marketing game content", () => {
  it("references only valid game keys and unique slugs", () => {
    const slugs = new Set<string>();
    for (const g of GAME_CONTENT) {
      expect(isGameKey(g.key)).toBe(true);
      expect(slugs.has(g.slug)).toBe(false);
      slugs.add(g.slug);
    }
  });

  it("keeps meta summaries within ~160 chars and has at least one FAQ + HowTo step", () => {
    for (const g of GAME_CONTENT) {
      expect(g.summary.length).toBeLessThanOrEqual(160);
      expect(g.faq.length).toBeGreaterThan(0);
      expect(g.howTo.length).toBeGreaterThan(0);
    }
  });

  it("flags betting games and their FAQ mentions virtual chips (§11.4)", () => {
    const svara = getGameContent("svara")!;
    expect(svara.betting).toBe(true);
    const joined = svara.faq.map((f) => f.answer).join(" ");
    expect(joined).toMatch(/виртуални чипове/);
  });

  it("builds valid JSON-LD shapes", () => {
    const g = GAME_CONTENT[0]!;
    expect(videoGameLd(g)["@type"]).toBe("VideoGame");
    expect(faqLd(g)["@type"]).toBe("FAQPage");
    expect(howToLd(g)["@type"]).toBe("HowTo");
  });
});
