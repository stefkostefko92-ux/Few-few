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

// ─── Разширение 23.10.2026 ──────────────────────────────────────────────────
// Двете проверки горе гледат само cs-label и placeholder — и затова пропуснаха
// 137 низа: заглавия, абзаци, бутони, тостове, aria-label, съобщения за
// потвърждение. В български акаунт таблото беше наполовина английско, а
// гейтът — зелен. Тук се гледа целият екран: текстът между таговете, редовете
// само с текст и атрибутите, които четецът на екрана изговаря.
const SRC = join(PAGES, "..");
const SCREENS = [
  ...CLIENT_PAGES.map((f) => join("pages", f)),
  ...["CommandsPage.jsx", "ServerHome.jsx", "TagsPage.jsx", "PremiumPage.jsx", "PrivacySettingsPage.jsx",
      "GamePage.jsx", "SecurityPage.jsx", "Dashboard.jsx"].map((f) => join("pages", f)),
  ...["Layout.jsx", "DashboardTopbar.jsx", "EmojiPicker.jsx", "PremiumToast.jsx", "ToastHost.jsx",
      "CookieConsent.jsx", "ConfirmDialog.jsx", "Modal.jsx", "EmptyState.jsx", "DiscordPicker.jsx",
      "GraceBanner.jsx", "PastDueBanner.jsx", "MfaGate.jsx", "ServerCrest.jsx", "ErrorBoundary.jsx"].map((f) => join("components", f)),
];
// Собствени имена — фирмите-обработващи в страницата за поверителност и
// импресумът (адресът на фирмата не се превежда). Имена на HTTP заглавия също.
const PROPER = /^(Hetzner Online GmbH|Stripe Payments Europe Ltd|Discord Inc\.|Google LLC \(Gemini API\)|Minecraft\\nValorant\\nAmong Us)$|^Carbon Stealth VCC\b|^X-[\w-]+:/;
// Коментарите не се показват: махаме ги, като пазим новите редове (за номерата).
const stripComments = (s) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
const englishPhrase = (txt) => /[A-Za-z]{2,}/.test(txt) && !TECHNICAL.test(txt) && !PROPER.test(txt);

describe("целият екран, не само етикетите", () => {
  it("няма зашит текст между таговете и няма редове само с текст", () => {
    const bad = [];
    for (const f of SCREENS) {
      const s = stripComments(readFileSync(join(SRC, f), "utf8"));
      // >Текст< — между два тага, без израз в {}.
      for (const m of s.matchAll(/>\s*([A-Za-z][^<>{}\n]*[A-Za-z.!?…):])\s*</g)) {
        if (englishPhrase(m[1].trim()) && /\s/.test(m[1].trim())) bad.push(`${f}:${lineOf(s, m.index)} „${m[1].trim()}“`);
      }
      // Ред само с изречение (JSX текст, пренесен на нов ред).
      for (const m of s.matchAll(/^[ \t]+([A-Z][a-z]+(?: [A-Za-z,.'’&;—-]+){2,})[ \t]*$/gm)) {
        if (englishPhrase(m[1])) bad.push(`${f}:${lineOf(s, m.index)} „${m[1]}“`);
      }
    }
    expect(bad, `изнеси ги като ключ и преведи на 8-те локала: ${bad.join(", ")}`).toEqual([]);
  });

  it("aria-label, title, тостовете и потвържденията не са сурови низове", () => {
    const bad = [];
    const ATTR = [
      /\b(?:aria-label|title|confirmLabel|placeholder)=\{?"([^"]*[A-Za-z]{2,}[^"]*)"/g,
      /\b(?:aria-label|title)=\{`([A-Za-z][^`]*)`\}/g,
      /\btoast\.(?:success|error|info)\(\s*["'`]([^"'`]+)["'`]/g,
      /\b(?:title|message|confirmLabel|label|text):\s*["'`]([A-Z][a-z][^"'`]*)["'`]/g,
      /\bset\w*(?:Error|Message)\(\s*["'`]([A-Z][a-z][^"'`]*)["'`]/g,
      /\|\|\s*["'`]([A-Z][a-z]+ [^"'`]*)["'`]\s*\}/g,
    ];
    for (const f of SCREENS) {
      const s = stripComments(readFileSync(join(SRC, f), "utf8"));
      for (const re of ATTR) {
        for (const m of s.matchAll(re)) {
          const txt = m[1].trim();
          // Примерен slug („welcome-info“) и адрес не са текст за превод.
          if (!englishPhrase(txt) || /^https?:\/\//.test(txt) || /^[a-z0-9-]+$/.test(txt)) continue;
          bad.push(`${f}:${lineOf(s, m.index)} „${txt}“`);
        }
      }
    }
    expect(bad, `изнеси ги като ключ и преведи на 8-те локала: ${bad.join(", ")}`).toEqual([]);
  });

  it("гейтът вижда истински низ (иначе е сляп)", () => {
    const probe = stripComments('<p>\n  Members react to a message to get a role.\n</p>\n<button aria-label="Close menu">');
    expect(/^[ \t]+([A-Z][a-z]+(?: [A-Za-z,.'’&;—-]+){2,})[ \t]*$/m.test(probe)).toBe(true);
    expect(/\baria-label="([^"]*[A-Za-z]{2,}[^"]*)"/.test(probe)).toBe(true);
  });
});
