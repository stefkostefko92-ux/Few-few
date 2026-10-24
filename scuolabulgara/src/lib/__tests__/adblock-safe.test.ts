import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Ad blockers (EasyList: uBlock, AdBlock, AdGuard, Brave, Supreme AdBlock) hide
// elements by name: `.ad-btn`, `.ad-field`, `.ad-panel`… made the admin login
// form vanish, and `#facebook` (social-widget lists) the whole Facebook section.
const SRC = fileURLToPath(new URL("../../", import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? (f === "__tests__" ? [] : files(p)) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });

describe("имена, които блокерите на реклами крият", () => {
  it("нито един клас или CSS променлива не започва с „ad-“", () => {
    const hits = files(SRC).flatMap((f) =>
      (readFileSync(f, "utf8").match(/(?<![\w])ad-[\w-]+/g) || []).map((m) => `${path.relative(SRC, f)}: ${m}`));
    expect(hits).toEqual([]);
  });

  it("никой елемент няма id „facebook“", () => {
    const hits = files(SRC).filter((f) => /\bid=["']facebook["']/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
