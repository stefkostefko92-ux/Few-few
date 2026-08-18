// frontend/src/__tests__/settings-payload.test.js
// White-label полетата се пращат САМО при план, който ги носи.
//
// Одит (07.08.2026): целият premium блок в SettingsPage висеше на `isPremium`,
// а той е ИСТИНА и за обикновен Premium — план, който НЕ включва white-label.
// Бекендът (`servers.js`) отказва с 403, щом полето ПРИСЪСТВА в тялото
// (`v !== undefined`), а `customBotName: null` е присъствие. Резултат: Premium
// клиент не можеше да запази НИКАКВА настройка — всеки запис връщаше 403.
//
// Структурен гейт: грубият флаг не бива да пази точна функция.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "..", "pages", "SettingsPage.jsx"), "utf8");
// Режем коментарите — обяснението горе съдържа същите имена.
const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

// Тялото на payload-а: от `const payload = {` до реда с `mutation.mutate`.
const payload = code.slice(code.indexOf("const payload = {"), code.indexOf("mutation.mutate"));

describe("SettingsPage payload — точен флаг за всяка функция", () => {
  const WHITE_LABEL = ["customBotName", "customBotAvatar", "customBotToken"];

  it("white-label полетата живеят в блок, гейтнат на hasWhiteLabel", () => {
    const wlBlock = payload.slice(payload.indexOf("server.hasWhiteLabel"));
    for (const f of WHITE_LABEL) {
      expect(wlBlock, `${f} не е под hasWhiteLabel гейта`).toContain(f);
    }
  });

  it("НИТО едно white-label поле не е под грубия isPremium гейт", () => {
    const start = payload.indexOf("server.isPremium");
    if (start === -1) return; // няма такъв блок — нищо за проверка
    const premiumBlock = payload.slice(start, payload.indexOf("server.hasWhiteLabel"));
    for (const f of WHITE_LABEL) {
      expect(premiumBlock, `${f} е под isPremium — Premium клиент ще получава 403`).not.toContain(f);
    }
  });
});
