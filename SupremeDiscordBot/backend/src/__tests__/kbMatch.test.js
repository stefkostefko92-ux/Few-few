// backend/src/__tests__/kbMatch.test.js
// v32 — Knowledge Base suggestion matching (pure function, no DB).
import { describe, it, expect } from "vitest";
import { scoreArticle, findBestMatch } from "../lib/kbMatch.js";

describe("scoreArticle", () => {
  it("counts one point per keyword contained in the query", () => {
    const article = { keywords: ["refund", "payment", "invoice"] };
    expect(scoreArticle(article, "how do i get a refund on my payment?")).toBe(2);
  });

  it("returns 0 when no keywords match", () => {
    const article = { keywords: ["refund", "payment"] };
    expect(scoreArticle(article, "how do i change my nickname")).toBe(0);
  });

  it("returns 0 for an article with no keywords or an empty query", () => {
    expect(scoreArticle({ keywords: [] }, "refund please")).toBe(0);
    expect(scoreArticle({ keywords: ["refund"] }, "")).toBe(0);
  });
});

describe("findBestMatch", () => {
  const articles = [
    { id: "a1", keywords: ["refund", "payment"], enabled: true },
    { id: "a2", keywords: ["refund", "payment", "invoice", "billing"], enabled: true },
    { id: "a3", keywords: ["nickname", "username"], enabled: true },
  ];

  it("picks the article with the highest keyword score", () => {
    const best = findBestMatch(articles, "I was charged twice, need a refund on my invoice/payment");
    expect(best?.id).toBe("a2");
  });

  it("returns null when nothing scores at least 1", () => {
    expect(findBestMatch(articles, "the server keeps crashing")).toBeNull();
  });

  it("skips disabled articles even if they'd otherwise win", () => {
    const withDisabled = [
      { id: "a1", keywords: ["refund"], enabled: false },
      { id: "a2", keywords: ["refund"], enabled: true },
    ];
    expect(findBestMatch(withDisabled, "refund please")?.id).toBe("a2");
  });

  it("returns null for empty query or empty article list", () => {
    expect(findBestMatch(articles, "")).toBeNull();
    expect(findBestMatch([], "refund")).toBeNull();
  });
});
