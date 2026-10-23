// cookieConsent-i18n.test.js — банерът за бисквитки на 8-те езика (23.10.2026).
//
// До тази дата банерът беше САМО на английски — и на /bg, и в български акаунт.
// Съгласие, дадено на непознат език, трудно е „информирано“ (ОРЗД чл. 4(11)).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COOKIE_CONSENT, cookieConsentLocale } from "../i18n/cookieConsent";
import { LANDING_LOCALES } from "../components/Seo";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("банерът за бисквитки — паритет и избор на език", () => {
  it("всеки език на сайта има банер със същите ключове и без празни низове", () => {
    const keys = Object.keys(COOKIE_CONSENT.en).sort();
    for (const loc of LANDING_LOCALES) {
      expect(COOKIE_CONSENT[loc], `липсва ${loc}`).toBeTruthy();
      expect(Object.keys(COOKIE_CONSENT[loc]).sort(), loc).toEqual(keys);
      for (const k of keys) expect(COOKIE_CONSENT[loc][k].trim(), `${loc}.${k}`).not.toBe("");
    }
  });

  it("преводите не обещават повече от оригинала: и двата бутона за избор са равни", () => {
    // „Откажи“ трябва да е толкова видимо, колкото „Приеми“ (EDPB 03/2022) —
    // гейтът пази двата бутона да носят еднакъв клас.
    const code = readFileSync(join(SRC, "components", "CookieConsent.jsx"), "utf8");
    const accept = code.match(/onClick=\{acceptAll\}\s*className="([^"]+)"/)?.[1];
    const reject = code.match(/onClick=\{rejectNonEssential\}\s*className="([^"]+)"/)?.[1];
    expect(accept, "бутонът „Приеми всички“ не е намерен").toBeTruthy();
    expect(reject).toBe(accept);
  });

  it("езикът: преведената страница печели, после акаунтът, после английски", () => {
    expect(cookieConsentLocale("/bg", "en")).toBe("bg");
    expect(cookieConsentLocale("/de/anything", "pl")).toBe("de");
    expect(cookieConsentLocale("/dashboard/123", "it")).toBe("it");
    expect(cookieConsentLocale("/", "en")).toBe("en");
    expect(cookieConsentLocale("/privacy", "xx")).toBe("en");
  });

  it("компонентът не носи зашит английски", () => {
    const code = readFileSync(join(SRC, "components", "CookieConsent.jsx"), "utf8");
    for (const s of ["We use cookies", "Accept all", "Reject non-essential", "Customize", "Save preferences"]) {
      expect(code, s).not.toContain(s);
    }
  });
});
