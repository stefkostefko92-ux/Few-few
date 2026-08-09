// frontend/src/__tests__/consentWithdrawal.test.js
// Съгласието може да се ОТТЕГЛИ — чл. 7(3) ОРЗД.
//
// ДЕФЕКТЪТ (Правният Разбирач, одит 07.08.2026): банерът се показваше само при
// липсващ или остарял запис. Веднъж решил, човекът нямаше как да си промени
// решението — нито връзка, нито икона, нито каквото и да е. А чл. 7(3) иска
// оттеглянето да е ТОЛКОВА ЛЕСНО, колкото даването.
//
// Практическата експозиция беше ниска (реално нямаме неесенциални бисквитки —
// единствената е `sid`), но правото не пита колко бисквитки имаш; пита дали
// човекът може да си вземе решението обратно.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(SRC, ...p), "utf8");

describe("механизмът за оттегляне съществува и е свързан", () => {
  it("компонентът слуша събитие за повторно отваряне", () => {
    const code = read("components", "CookieConsent.jsx");
    expect(code).toContain('addEventListener("cookie-preferences"');
    // Без премахване при размонтиране слушателите се трупат при всяка навигация.
    expect(code, "слушателят не се маха при размонтиране").toContain('removeEventListener("cookie-preferences"');
  });

  it("има публична функция, вместо всяка страница да пуска събитие на ръка", () => {
    expect(read("components", "CookieConsent.jsx")).toContain("export function openCookiePreferences");
  });

  it("футърът реално я вика — иначе е мъртъв код", () => {
    const layout = read("components", "Layout.jsx");
    expect(layout).toContain("openCookiePreferences");
    expect(layout, "функцията се ползва, но не е внесена").toMatch(/import \{[^}]*openCookiePreferences[^}]*\}/);
  });

  it("бутонът е ПРЕВЕДЕН, не е зашит на английски", () => {
    expect(read("components", "Layout.jsx")).toContain('t("privacy.cookiePrefs")');
    for (const loc of ["en", "bg", "de", "es", "fr", "it", "nl", "pl"]) {
      expect(read("i18n", "dashboard", `${loc}.js`), `${loc} няма ключа`).toContain('"privacy.cookiePrefs"');
    }
  });
});

describe("повторното отваряне показва ПРЕДИШНИЯ избор", () => {
  it("запазените предпочитания се възстановяват, не се нулират", () => {
    // Нулиран изглед при повторно отваряне е тъмен модел: човекът вижда
    // „всичко изключено“ и си мисли, че вече е оттеглил, без да е.
    const code = read("components", "CookieConsent.jsx");
    expect(code).toMatch(/setPrefs\(\(p\) => \(\{[^}]*analytics:\s*!!parsed\.analytics/);
  });
});

// ─── Поведение, не само присъствие ──────────────────────────────────────────
describe("събитието наистина превключва състоянието", () => {
  let handler;
  beforeEach(() => {
    handler = null;
    vi.stubGlobal("window", {
      addEventListener: (name, fn) => { if (name === "cookie-preferences") handler = fn; },
      removeEventListener: () => {},
      dispatchEvent: (ev) => { if (ev?.type === "cookie-preferences" && handler) handler(ev); },
      CustomEvent: class { constructor(type) { this.type = type; } },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("`openCookiePreferences` праща събитието, което слушателят чака", async () => {
    const { openCookiePreferences } = await import("../components/CookieConsent.jsx");
    let fired = false;
    handler = () => { fired = true; };
    openCookiePreferences();
    expect(fired, "функцията не задейства слушателя — веригата е скъсана").toBe(true);
  });
});
