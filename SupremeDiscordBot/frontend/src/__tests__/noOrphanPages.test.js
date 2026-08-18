// frontend/src/__tests__/noOrphanPages.test.js
// Публична страница, до която не се стига от началната, е невидима.
//
// ДЕФЕКТЪТ (собственикът, 12.08.2026: „защо я няма на landing page никъде?"):
// петте growth страници (`/guides/*`, `/compare/*`) се стигаха само ОТВЪТРЕ в
// таблото (тоест иска вход), една от друга и от `sitemap.xml`. Посетител на
// началната страница нямаше път до тях — документацията беше невидима точно за
// хората, за които е писана.
//
// Sitemap-ът НЕ е решение: той казва на търсачката, че страницата съществува,
// но не дава на човека начин да я намери, нито дава вътрешна тежест при
// обхождането. Затова гейтът иска ВРЪЗКА от двете начални страници.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(SRC, ...p), "utf8");

const app = read("App.jsx");
const login = read("pages", "Login.jsx");             // „/" — английската начална
const landing = read("pages", "LandingLocalized.jsx"); // /bg, /de, … (7 локала)

/** Публичните маршрути на съдържание, обявени в App.jsx. */
const contentRoutes = [...app.matchAll(/path="(\/(?:guides|compare)\/[a-z0-9-]+)"/g)]
  .map((m) => m[1]);

describe("нула осиротели публични страници", () => {
  it("изобщо намирам такива маршрути (иначе тестът е сляп)", () => {
    expect(contentRoutes.length).toBeGreaterThanOrEqual(5);
  });

  it("всяка се линква от английската начална страница", () => {
    const missing = contentRoutes.filter((r) => !login.includes(`href="${r}"`));
    expect(missing, `няма връзка от Login.jsx: ${missing.join(", ")}`).toEqual([]);
  });

  it("всяка се линква и от локализираните начални страници", () => {
    const missing = contentRoutes.filter((r) => !landing.includes(`href="${r}"`));
    expect(missing, `няма връзка от LandingLocalized.jsx: ${missing.join(", ")}`).toEqual([]);
  });

  it("етикетите съществуват на ВСИЧКИ локала, не само на български", () => {
    // Липсващ ключ на един език значи празна връзка там — по-лошо от липсваща.
    const i18n = read("i18n", "landing.js");
    const locales = (i18n.match(/^\s{2}[a-z]{2}: \{/gm) || []).length;
    const guides = (i18n.match(/guides: \{ heading:/g) || []).length;
    expect(locales, "не разпознавам локалите").toBeGreaterThanOrEqual(7);
    expect(guides, `етикети има само на ${guides} от ${locales} локала`).toBe(locales);
  });
});
