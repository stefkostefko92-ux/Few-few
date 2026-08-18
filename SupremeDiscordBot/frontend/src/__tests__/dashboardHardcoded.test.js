// frontend/src/__tests__/dashboardHardcoded.test.js
// Нула твърдо зашит английски текст в клиентските екрани.
//
// ЗАЩО (08.08.2026): таблото имаше 8 локала и гейтван паритет на КЛЮЧОВЕТЕ — но
// това пази само вече изнесените низове. „Advanced" секциите на Forms, Panels,
// Settings, Verification и Automation бяха 97 етикета, подсказки и примери,
// зашити на английски направо в JSX-а. Паритетът беше зелен, защото те изобщо
// не съществуваха като ключове: гейт, който брои преведеното, не вижда
// НЕизнесеното. Затова тук се брои обратното — сурови английски низове.
//
// AdminPage е ИЗКЛЮЧЕН: суперпотребителски инструмент с един ползвател
// (собственикът), не клиентски екран. Login/LandingLocalized също — тяхната
// локализация минава по друг път (`i18n/landing.js`, отделни маршрути).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "pages");
const CLIENT_PAGES = [
  "AutomationPage.jsx", "VerificationPage.jsx", "FormsPage.jsx", "SettingsPage.jsx",
  "PanelsPage.jsx", "KnowledgeBasePage.jsx", "TicketsPage.jsx", "ApiKeysPage.jsx",
  "ApplicationsPage.jsx", "AnalyticsPage.jsx", "WebhooksPage.jsx",
];
const read = (f) => readFileSync(join(PAGES, f), "utf8");
const lineOf = (s, i) => s.slice(0, i).split("\n").length;
const LATIN = /[A-Za-z]{2,}/;

// Технически думи, които НЕ се превеждат: имена на права в Discord, протоколи,
// марки. Превод на „Manage Channels" би бил вреден — човекът търси точно този
// надпис в интерфейса на Discord.
const TECHNICAL = /^(Discord|Stripe|HMAC|URL|API|JSON|UTC|ID|Markdown|Webhook|Embed|Nitro|Supreme Bot|Manage \w+|Send Messages|View Channel|Embed Links)$/i;

describe("клиентските екрани нямат зашит английски", () => {
  it("нито един cs-label не е суров текст", () => {
    const bad = [];
    for (const f of CLIENT_PAGES) {
      const s = read(f);
      for (const m of s.matchAll(/className="cs-label">([^<{}]+)</g)) {
        const txt = m[1].trim();
        if (!txt || !LATIN.test(txt) || TECHNICAL.test(txt)) continue;
        bad.push(`${f}:${lineOf(s, m.index)} „${txt}“`);
      }
    }
    expect(bad, `изнеси ги като ключ и преведи на 8-те локала: ${bad.join(", ")}`).toEqual([]);
  });

  it("нито един placeholder не е суров текст", () => {
    const bad = [];
    for (const f of CLIENT_PAGES) {
      const s = read(f);
      for (const m of s.matchAll(/placeholder="([^"]+)"/g)) {
        const txt = m[1].trim();
        // Примерни стойности без букви (числа, emoji, „0", „#") не се превеждат.
        if (!LATIN.test(txt) || TECHNICAL.test(txt) || /^https?:\/\//.test(txt)) continue;
        bad.push(`${f}:${lineOf(s, m.index)} „${txt}“`);
      }
    }
    expect(bad, `изнеси ги като ключ и преведи на 8-те локала: ${bad.join(", ")}`).toEqual([]);
  });
});
