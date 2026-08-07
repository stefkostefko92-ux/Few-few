// backend/src/__tests__/languages.test.js
// Гейт за списъка с езици.
//
// Историята: auth.js приемаше само ["en","bg","it"], докато ботът вече говори
// 8 езика — потребител не можеше да си запази език, който ботът поддържа.
// Списъкът вече е един (lib/languages.js); тестът го държи в синхрон с
// реалните locale файлове на бота (един файл на код).
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, isSupportedLanguage } from "../lib/languages.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BOT_I18N = join(ROOT, "bot", "src", "i18n");

describe("поддържани езици", () => {
  it("има точно осемте европейски езика на продукта", () => {
    expect([...SUPPORTED_LANGUAGES].sort()).toEqual(["bg", "de", "en", "es", "fr", "it", "nl", "pl"]);
  });

  it("всеки код има човешко име", () => {
    for (const code of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_NAMES[code], `липсва име за ${code}`).toBeTruthy();
    }
    // и обратно — без осиротели имена
    expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it("съвпада с locale файловете на бота (един източник на истина)", () => {
    const botLocales = readdirSync(BOT_I18N)
      .filter((f) => /^[a-z]{2}\.js$/.test(f))
      .map((f) => f.replace(".js", ""))
      // index.js регистрира само реалните locale-и; „ex.js“ не е сред тях.
      .filter((code) => SUPPORTED_LANGUAGES.includes(code));
    for (const code of SUPPORTED_LANGUAGES) {
      expect(botLocales, `ботът няма locale файл за ${code}`).toContain(code);
    }
  });

  it("isSupportedLanguage приема познати и отхвърля непознати/боклук", () => {
    expect(isSupportedLanguage("de")).toBe(true);
    expect(isSupportedLanguage("bg")).toBe(true);
    expect(isSupportedLanguage("jp")).toBe(false);
    expect(isSupportedLanguage("")).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
  });
});
