import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { DEFAULT_CONTENT } from "../defaults";
import { LOCALES } from "../i18n";
import { SECTION_KEYS, finalKeywords } from "../cms";

const PUBLIC = join(__dirname, "..", "..", "..", "public");
const keysOf = (o: unknown) => Object.keys(o as object).sort();

describe("съдържание по подразбиране", () => {
  it("всеки ред има еднаква схема в трите езика", () => {
    for (const row of DEFAULT_CONTENT) {
      const [first, ...rest] = LOCALES;
      for (const l of rest) expect(keysOf(row[l]), `${row.key}: ${l} ≠ ${first}`).toEqual(keysOf(row[first]));
    }
  });

  it("всеки списък има еднаква дължина в трите езика", () => {
    for (const row of DEFAULT_CONTENT) {
      for (const [k, v] of Object.entries(row.it)) {
        if (!Array.isArray(v)) continue;
        for (const l of LOCALES) expect((row[l][k] as unknown[]).length, `${row.key}.${k} (${l})`).toBe(v.length);
      }
    }
  });

  it("всяка секция на страницата има ред с подразбиране", () => {
    const keys = new Set(DEFAULT_CONTENT.map((r) => r.key));
    for (const k of SECTION_KEYS) expect(keys.has(k), k).toBe(true);
  });

  it("ключовете са уникални", () => {
    const keys = DEFAULT_CONTENT.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("всяка снимка по подразбиране реално съществува в public/", () => {
    const urls = new Set<string>();
    const walk = (v: unknown) => {
      if (typeof v === "string" && v.startsWith("/assets/")) urls.add(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    DEFAULT_CONTENT.forEach((r) => LOCALES.forEach((l) => walk(r[l])));
    expect(urls.size).toBeGreaterThan(5);
    for (const u of urls) expect(existsSync(join(PUBLIC, u)), u).toBe(true);
  });

  it("всяка снимка има описание за незрящи на трите езика", () => {
    for (const row of DEFAULT_CONTENT) {
      for (const l of LOCALES) {
        const d = row[l] as Record<string, unknown>;
        if ("image" in d) expect(String(d.imageAlt || "").length, `${row.key} ${l}`).toBeGreaterThan(0);
        for (const p of (d.photos as { alt: string }[] | undefined) ?? []) expect(p.alt.length, `${row.key} ${l}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("заключени надписи", () => {
  const ui = DEFAULT_CONTENT.find((r) => r.key === "ui")!;

  it("кредитът на агенцията и кредитът CC BY-SA за снимката НЕ са редактируеми", () => {
    for (const l of LOCALES) {
      expect(ui[l]).not.toHaveProperty("credit");
      expect(ui[l]).not.toHaveProperty("photoCredit");
    }
  });

  it("заглавията на ЧЗВ живеят в секцията ЧЗВ, не в надписите", () => {
    for (const l of LOCALES) expect(Object.keys(ui[l]).some((k) => k.startsWith("faq."))).toBe(false);
  });
});

describe("SEO по подразбиране", () => {
  const seo = DEFAULT_CONTENT.find((r) => r.key === "seo")!;
  const userKeywords = ["scuola bulgara", "scuola bulgara milano", "българско училище", "българско училище в Милано", "Carbon Stealth"];

  it("всеки език пази петте ключови думи, които собственикът поиска", () => {
    for (const l of LOCALES) {
      const kw = (seo[l] as { keywords: string[] }).keywords;
      for (const k of userKeywords) expect(kw, `${l}: ${k}`).toContain(k);
    }
  });

  it("крайният списък отговаря на правилото на репото", () => {
    for (const l of LOCALES) {
      const out = finalKeywords((seo[l] as { keywords: string[] }).keywords, []);
      expect(out.length).toBeGreaterThanOrEqual(5);
      expect(out).toContain("Carbon Stealth");
    }
  });

  it("описанието е на езика на страницата (не италианско навсякъде)", () => {
    const d = (l: string) => (seo[l as "it"] as { description: string }).description;
    expect(d("bg")).toMatch(/[а-яА-Я]/);
    expect(d("en")).not.toBe(d("it"));
  });
});

describe("описанията по подразбиране идват от единия източник", async () => {
  const { bundledAlt } = await import("../cms");
  it("всяка снимка в секция или галерия носи каноничното си описание", () => {
    for (const row of DEFAULT_CONTENT) for (const l of LOCALES) {
      const d = row[l] as Record<string, unknown>;
      if (typeof d.image === "string") expect(d.imageAlt, `${row.key} ${l}`).toBe(bundledAlt(d.image)?.[l]);
      for (const p of (d.photos as { src: string; alt: string }[] | undefined) ?? []) expect(p.alt, `${p.src} ${l}`).toBe(bundledAlt(p.src)?.[l]);
    }
  });
});

describe("азбуката", () => {
  const row = DEFAULT_CONTENT.find((r) => r.key === "alphabet")!;
  const BG = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯ";

  it("има точно 30-те букви на българската азбука, по ред", () => {
    for (const l of LOCALES) {
      const letters = (row[l] as { letters: { letter: string }[] }).letters.map((x) => x.letter).join("");
      expect(letters, l).toBe(BG);
    }
  });

  it("всяка дума започва със своята буква (освен Ь, която никога не е първа)", () => {
    for (const x of (row.it as { letters: { letter: string; word: string }[] }).letters) {
      if (x.letter === "Ь") expect(x.word.toUpperCase()).toContain("Ь");
      else expect(x.word[0].toUpperCase(), x.word).toBe(x.letter);
    }
  });

  it("значението е на италиански и на българската страница (за двуезичните деца)", () => {
    const it = (row.it as { letters: { meaning: string }[] }).letters.map((x) => x.meaning);
    const bg = (row.bg as { letters: { meaning: string }[] }).letters.map((x) => x.meaning);
    expect(bg).toEqual(it);
  });
});

describe("без шаблонни надзаглавия", () => {
  it("нито една секция няма поле eyebrow", () => {
    for (const row of DEFAULT_CONTENT) for (const l of LOCALES) expect(row[l], `${row.key} ${l}`).not.toHaveProperty("eyebrow");
  });
  it("числата (stats) ги няма", () => {
    expect(DEFAULT_CONTENT.some((r) => r.key === "stats")).toBe(false);
  });
});
