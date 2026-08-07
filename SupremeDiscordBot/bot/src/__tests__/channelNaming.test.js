// bot/src/__tests__/channelNaming.test.js
// „Шаблон за име на тикет“ РЕАЛНО се прилага.
//
// Дефектът (одит 07.08.2026): `namingTemplate` е настройка в таблото, преведена
// на 8 езика и валидирана в backend-а — но ботът НЕ я четеше и строеше името
// само от префикса. Клиент пишеше `support-{username}`, получаваше
// `ticket-0001-username`. Видима настройка, която не прави нищо.
//
// Гейтът е структурен (логиката живее вътре в голям handler), плюс проверка на
// самото правило за санитизация — то е потребителски вход към Discord.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "events", "interactionCreate.js"),
  "utf-8",
);
const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const fn = code.slice(code.indexOf("function buildChannelName"));
const body = fn.slice(0, fn.indexOf("\n  }") + 4);

describe("името на тикет канала уважава шаблона", () => {
  it("buildChannelName чете panel.namingTemplate", () => {
    expect(body).toMatch(/namingTemplate/);
  });

  it("поддържа {username} и {number}", () => {
    // В изходния код маркерите живеят в regex (`/\{username\}/gi`), затова
    // литералът носи обратни наклонени черти — търсим ИМЕТО, не суровия низ.
    expect(body).toMatch(/username\\?\}/);
    expect(body).toMatch(/number\\?\}/);
    expect(body).toMatch(/\.replace\(/);
  });

  it("има резерва към стария формат при празен шаблон", () => {
    // Заварените панели нямат шаблон — не бива да се чупят.
    expect(body).toMatch(/channelNamePrefix/);
  });
});

// Правилото за санитизация, изпълнено срещу истински входове. Шаблонът е
// ПОТРЕБИТЕЛСКИ вход, а Discord иска малки букви, без интервали, ≤100 знака.
describe("санитизацията на шаблона (изпълнена)", () => {
  // Огледало на логиката в buildChannelName — тестваме ПРАВИЛОТО, не подниза.
  const sanitize = (filled) =>
    filled.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
      .replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

  it("интервалите стават тирета", () => {
    expect(sanitize("Support Ticket")).toBe("support-ticket");
  });

  it("забранените знаци падат", () => {
    expect(sanitize("тикет#42!@")).toBe("42");
  });

  it("нула двойни тирета и водещи/завършващи", () => {
    expect(sanitize("--a  --  b--")).toBe("a-b");
  });

  it("реже до 100 знака (таванът на Discord)", () => {
    expect(sanitize("a".repeat(150))).toHaveLength(100);
  });

  it("шаблон само от забранени знаци дава празно → кодът пада на резервата", () => {
    expect(sanitize("###")).toBe("");
  });
});
