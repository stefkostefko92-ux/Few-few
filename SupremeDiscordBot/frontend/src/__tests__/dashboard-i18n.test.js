// frontend/src/__tests__/dashboard-i18n.test.js
// Гейт за превода на дашборда.
//
// Английският (en.js) е канонът: определя кои ключове съществуват. Всеки друг
// език ТРЯБВА да има точно същите ключове — липсващ ключ показва английски
// (fallback), а излишен е мъртъв превод. Тестът лови и двете, преди да са се
// натрупали. Пази и плейсхолдърите ({days}, {n}) да не изчезнат в превода.
import { describe, it, expect } from "vitest";
import { DASHBOARD_LOCALES, LANGUAGE_OPTIONS, DEFAULT_LOCALE } from "../i18n/dashboard";

const CANON = DASHBOARD_LOCALES[DEFAULT_LOCALE];
const CANON_KEYS = Object.keys(CANON).sort();
const OTHER = Object.keys(DASHBOARD_LOCALES).filter((l) => l !== DEFAULT_LOCALE);

const placeholders = (str) => (String(str).match(/\{(\w+)\}/g) || []).sort();

describe("dashboard i18n", () => {
  it("канонът (en) не е празен", () => {
    expect(CANON_KEYS.length).toBeGreaterThan(50);
  });

  it("всеки език има ТОЧНО ключовете на канона (нито липсващ, нито излишен)", () => {
    for (const loc of OTHER) {
      const keys = Object.keys(DASHBOARD_LOCALES[loc]).sort();
      const missing = CANON_KEYS.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !CANON_KEYS.includes(k));
      expect(missing, `${loc}: липсват ключове`).toEqual([]);
      expect(extra, `${loc}: излишни ключове`).toEqual([]);
    }
  });

  it("никоя стойност не е празна", () => {
    for (const loc of Object.keys(DASHBOARD_LOCALES)) {
      for (const [k, v] of Object.entries(DASHBOARD_LOCALES[loc])) {
        expect(String(v).trim(), `${loc}/${k}: празна стойност`).toBeTruthy();
      }
    }
  });

  it("плейсхолдърите ({days}, {n}) оцеляват в превода", () => {
    for (const loc of OTHER) {
      for (const key of CANON_KEYS) {
        const want = placeholders(CANON[key]);
        const got = placeholders(DASHBOARD_LOCALES[loc][key]);
        expect(got, `${loc}/${key}: плейсхолдърите се разминават`).toEqual(want);
      }
    }
  });

  it("превключвателят предлага точно наличните езици", () => {
    expect(LANGUAGE_OPTIONS.map((o) => o.code).sort()).toEqual(Object.keys(DASHBOARD_LOCALES).sort());
  });

  it("никой превод не съдържа повредени знаци (CJK в европейски текст)", () => {
    const bad = [];
    for (const loc of Object.keys(DASHBOARD_LOCALES)) {
      for (const ch of JSON.stringify(DASHBOARD_LOCALES[loc])) {
        const cp = ch.codePointAt(0);
        if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3040 && cp <= 0x30ff)) bad.push(`${loc}: ${ch}`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});
