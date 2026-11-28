// frontend/src/__tests__/bannerPicker.test.js
// „Банер в Discord“ (Токсична броня, 28.11.2026): изборът пише пълен публичен адрес в imageUrl
// (Discord тегли картинката оттам), разпознава готовите банери и пази чужда картинка.
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BANNER_IDS, bannerUrl, bannerChoice } from "../components/BannerPicker.jsx";
import { BANNERS } from "../../scripts/build-banners.mjs";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");

describe("BannerPicker", () => {
  it("всеки банер от избора е генериран и е на диска", () => {
    expect(BANNER_IDS).toEqual(BANNERS);
    for (const id of BANNER_IDS) expect(existsSync(join(PUBLIC, "banners", `${id}.jpg`))).toBe(true);
  });
  it("адресът е пълен (с произхода) — Discord не приема относителен", () => {
    expect(bannerUrl("shield", "https://supremebot.carbonstealth.eu")).toBe("https://supremebot.carbonstealth.eu/banners/shield.jpg");
  });
  it("разпознава избора; празно = без банер; чужд адрес = собствена картинка", () => {
    expect(bannerChoice("")).toBe("none");
    expect(bannerChoice(null)).toBe("none");
    expect(bannerChoice("https://supremebot.carbonstealth.eu/banners/gold.jpg")).toBe("gold");
    expect(bannerChoice("https://cdn.example.com/my.png")).toBe("custom");
  });
  it("ревю: само каноничният адрес е наш банер — чужд хост със същия път е собствена картинка", () => {
    expect(bannerUrl("gold")).toBe("https://supremebot.carbonstealth.eu/banners/gold.jpg");
    expect(bannerChoice("https://evil.example/banners/gold.jpg")).toBe("custom");
    expect(bannerChoice("http://localhost:5173/banners/gold.jpg")).toBe("custom");
  });
});
