import { describe, expect, it } from "vitest";
import { CHAT_MAX_LEN } from "@aso/shared";
import { sanitizeChat } from "./chat.js";

describe("чат — маскиране по цяла дума", () => {
  it("безобидни думи с корен вътре не се маскират (курорт, педагог, Dickens, тъпан, shiitake)", () => {
    for (const w of ["курорт", "курс", "педагог", "Dickens", "тъпан", "shiitake", "куриер", "Scunthorpe", "педал", "педали", "педалите"]) {
      expect(sanitizeChat(`ходим в ${w} утре`)).toBe(`ходим в ${w} утре`);
    }
  });

  it("цели нецензурни думи (и честите окончания) се маскират, останалото остава", () => {
    expect(sanitizeChat("you shit")).toBe("you s●●●");
    expect(sanitizeChat("Fucking идиот")).toBe("F●●●●●● и●●●●");
    expect(sanitizeChat("ти си тъп!")).toBe("ти си т●●!");
    expect(sanitizeChat("курви")).toBe("к●●●●");
    expect(sanitizeChat("пед")).toBe("п●●");
  });

  it("разредени единични букви се сгъват преди проверката", () => {
    expect(sanitizeChat("f u c k you")).toBe("●●●● you");
    expect(sanitizeChat("f.u.c.k")).toBe("●●●●");
    expect(sanitizeChat("ти си т ъ п")).toBe("ти си ●●●");
    expect(sanitizeChat("ok b i t c h")).toBe("ok ●●●●●");
    // обикновени думи от по няколко единични букви не се засягат
    expect(sanitizeChat("а и о")).toBe("а и о");
  });

  it("невидими знаци не крият думата (zero-width, soft hyphen, BOM)", () => {
    expect(sanitizeChat("fu​ck")).toBe("f●●●");
    expect(sanitizeChat("sh­it")).toBe("s●●●");
    expect(sanitizeChat("﻿fuck")).toBe("f●●●");
    expect(sanitizeChat("ку‌рва")).toBe("к●●●●");
    // невидимите знаци се махат и от обикновен текст
    expect(sanitizeChat("при​вет")).toBe("привет");
  });

  it("комбиниращи знаци върху буквите не крият думата; NFD „й“ се нормализира", () => {
    expect(sanitizeChat("fu̶ck")).toBe("f●●●●");
    expect(sanitizeChat("чай".normalize("NFD"))).toBe("чай");
  });

  it("емоджи с ZWJ остават цели", () => {
    expect(sanitizeChat("👨‍👩‍👧")).toBe("👨‍👩‍👧");
  });
});

describe("чат — разредени букви: само цялата серия (F7)", () => {
  it("„к у р с“ и „к у р и“ не се маскират частично; цяла серия „к у р в а“ се маскира", () => {
    expect(sanitizeChat("к у р с по шах")).toBe("к у р с по шах");
    expect(sanitizeChat("т ъ п а н")).toBe("т ъ п а н");
    expect(sanitizeChat("к у р в а")).toBe("●●●●●");
  });
});

describe("чат — сложни емоджи остават цели (F8)", () => {
  it("ZWJ след модификатор за цвят на кожата", () => {
    expect(sanitizeChat("👩🏽\u200D⚕\uFE0F")).toBe("👩🏽\u200D⚕\uFE0F");
    expect(sanitizeChat("🧑🏿\u200D🤝\u200D🧑🏻")).toBe("🧑🏿\u200D🤝\u200D🧑🏻");
  });
  it("тагове U+E0020–E007F след 🏴 (флаг на Англия) се пазят; осиротели се махат", () => {
    const england = "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
    expect(sanitizeChat(england)).toBe(england);
    expect(sanitizeChat("a\u{E0067}\u{E0062}b")).toBe("ab");
  });
});

describe("чат — рязане по code point", () => {
  it("не чупи суррогатна двойка на границата", () => {
    const text = "а".repeat(CHAT_MAX_LEN - 1) + "😀😀";
    const out = sanitizeChat(text)!;
    expect(Array.from(out)).toHaveLength(CHAT_MAX_LEN);
    expect(out.endsWith("😀")).toBe(true);
    // няма висяща половина от суррогатна двойка
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(false);
  });
});
