// bot/src/__tests__/panelEmojiGuards.test.js
// Гейт срещу класа „едно лошо поле събаря целия панел".
//
// ДЕФЕКТЪТ (одит 10.08.2026): невалидно потребителско emoji НЕ хвърля при
// билд — discord.js builders го увиват в { name: "каквото-и-да-е" } и заявката
// пада чак в Discord API (400 Invalid Emoji) за ЦЯЛОТО съобщение. Затова
// try/catch около setEmoji беше илюзорна защита: тестът по-долу доказа, че
// builders приемат garbage без грешка. Единствената реална защита е да
// валидираме формата САМИ (sanitizeEmoji) на всяко място, където потребителски
// вход стига до emoji поле. Същият клас: null label (хвърля при toJSON) и
// етикет над тавана на Discord (80 бутон / 100 опция — реже API-то, не ние).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanitizeEmoji,
  buildPanelMessage,
  buildMultiPanelMessage,
} from "../utils/embed.js";
import { buildVerificationMessage } from "../utils/verificationEmbed.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("sanitizeEmoji", () => {
  it("приема custom emoji формат <:name:id> и <a:name:id>", () => {
    expect(sanitizeEmoji("<:tada:123456789012345678>")).toEqual({
      animated: false, name: "tada", id: "123456789012345678",
    });
    expect(sanitizeEmoji("<a:party:123456789012345678>")).toEqual({
      animated: true, name: "party", id: "123456789012345678",
    });
  });

  it("приема голо ID на custom emoji", () => {
    expect(sanitizeEmoji("123456789012345678")).toEqual({ id: "123456789012345678" });
  });

  it("приема unicode emoji, вкл. VS16 последователности", () => {
    expect(sanitizeEmoji("🎫")).toEqual({ name: "🎫" });
    expect(sanitizeEmoji("❤️")).toEqual({ name: "❤️" });
    expect(sanitizeEmoji("1️⃣")).toEqual({ name: "1️⃣" });
    expect(sanitizeEmoji(" ✅ ")).toEqual({ name: "✅" });
  });

  // РЕАЛЕН продукционен провал (11.08.2026): панелът падна с
  // `options[0].emoji.name[COMPONENT_INVALID_EMOJI]: Invalid emoji`, защото
  // проверката беше `.test(s)` — вярна при ЧАСТИЧНО съвпадение. Стринг, който
  // СЪДЪРЖА emoji, не е emoji.
  it("отхвърля emoji + текст — стрингът трябва да Е emoji, не да съдържа", () => {
    expect(sanitizeEmoji("🎫 Support")).toBeNull();
    expect(sanitizeEmoji("Support 🎫")).toBeNull();
    expect(sanitizeEmoji("Помощ 🎫")).toBeNull();
    expect(sanitizeEmoji("a🎫")).toBeNull();
  });

  it("отхвърля НЯКОЛКО emoji — Discord иска точно едно", () => {
    expect(sanitizeEmoji("🎫🎫")).toBeNull();
    expect(sanitizeEmoji("😀😀😀")).toBeNull();
  });

  it("приема съставните emoji, които са ЕДНА графема", () => {
    expect(sanitizeEmoji("👍🏽")).toEqual({ name: "👍🏽" });        // тон на кожата
    expect(sanitizeEmoji("🇧🇬")).toEqual({ name: "🇧🇬" });        // флаг
    expect(sanitizeEmoji("👨‍👩‍👧")).toEqual({ name: "👨‍👩‍👧" }); // ZWJ верига
  });

  it("отхвърля garbage — точно това, което Discord API би върнал като 400", () => {
    expect(sanitizeEmoji("notanemoji")).toBeNull();
    expect(sanitizeEmoji("hello world")).toBeNull();
    expect(sanitizeEmoji("")).toBeNull();
    expect(sanitizeEmoji(null)).toBeNull();
    expect(sanitizeEmoji(undefined)).toBeNull();
    expect(sanitizeEmoji(42)).toBeNull();
    expect(sanitizeEmoji("12345")).toBeNull(); // къси цифри не са snowflake
  });
});

// Панел с най-лошия възможен потребителски вход: null етикет, garbage emoji,
// етикет далеч над тавана. Панелът трябва да се билдне, без да хвърли, и без
// нито едно garbage emoji в изхода.
const hostileButtons = [
  { id: "b1", label: null, emoji: "notanemoji", style: "PRIMARY" },
  { id: "b2", label: "x".repeat(200), emoji: "🎫", style: "SUCCESS" },
  { id: "b3", label: "Ok", emoji: "<:tada:123456789012345678>", style: "DANGER" },
];
const hostilePanel = (over = {}) => ({
  id: "p1", name: "Support", title: "T", color: "#00ff00",
  buttons: hostileButtons, ...over,
});

describe("buildPanelMessage — враждебен вход не събаря панела", () => {
  it("BUTTON: резервен етикет, таван 80, garbage emoji отпада", () => {
    const { components } = buildPanelMessage(hostilePanel({ buttonStyle: "BUTTON" }));
    const row = components[0].toJSON();
    expect(row.components[0].label).toBe("Open");
    expect(row.components[0].emoji).toBeUndefined();
    expect(row.components[1].label).toHaveLength(80);
    expect(row.components[1].emoji).toEqual({ name: "🎫" });
    expect(row.components[2].emoji).toEqual(
      expect.objectContaining({ id: "123456789012345678" }),
    );
  });

  it("DROPDOWN: резервен етикет, таван 100, garbage emoji отпада", () => {
    const { components } = buildPanelMessage(hostilePanel({ buttonStyle: "DROPDOWN" }));
    const menu = components[0].toJSON().components[0];
    expect(menu.options[0].label).toBe("Open");
    expect(menu.options[0].emoji).toBeUndefined();
    expect(menu.options[1].label).toHaveLength(100);
    expect(menu.options[1].emoji).toEqual({ name: "🎫" });
  });
});

describe("buildMultiPanelMessage (MERGE) — същите гаранции", () => {
  it("DROPDOWN merge: garbage emoji отпада, валидните остават", () => {
    const { components } = buildMultiPanelMessage(
      [hostilePanel(), hostilePanel({ id: "p2", name: "Sales" })],
      { mode: "DROPDOWN" },
    );
    const menu = components[0].toJSON().components[0];
    expect(menu.options[0].emoji).toBeUndefined();
    expect(menu.options[1].emoji).toEqual({ name: "🎫" });
  });

  it("BUTTONS merge: garbage emoji отпада, валидните остават", () => {
    const { components } = buildMultiPanelMessage([hostilePanel()], { mode: "BUTTONS" });
    const row = components[0].toJSON();
    expect(row.components[0].emoji).toBeUndefined();
    expect(row.components[1].emoji).toEqual({ name: "🎫" });
  });
});

describe("buildVerificationMessage — същият клас", () => {
  it("garbage emoji отпада, дълъг етикет се реже на 80", () => {
    const { components } = buildVerificationMessage({
      id: "v1", type: "BUTTON", buttonEmoji: "notanemoji",
      buttonLabel: "y".repeat(200), buttonStyle: "SUCCESS",
    });
    const btn = components[0].toJSON().components[0];
    expect(btn.emoji).toBeUndefined();
    expect(btn.label).toHaveLength(80);
  });
});

// Гейт срещу ВРЪЩАНЕТО на дефекта: нито един файл в src/ няма право да подава
// суров потребителски emoji директно (btn.emoji / panel.buttonEmoji) към
// setEmoji или opt.emoji — само през sanitizeEmoji.
describe("нула сурови потребителски emoji извън sanitizeEmoji", () => {
  it("embed.js и verificationEmbed.js минават през sanitizeEmoji", () => {
    for (const f of ["utils/embed.js", "utils/verificationEmbed.js"]) {
      const src = readFileSync(join(SRC, f), "utf8");
      const raw = src.split("\n").filter((l) =>
        /setEmoji\((btn|panel)\.|emoji\s*[:=]\s*(btn|panel)\./.test(l) && !l.trim().startsWith("//"),
      );
      expect(raw, `${f}: суров потребителски emoji без sanitizeEmoji: ${raw.join(" | ")}`).toEqual([]);
    }
  });
});
