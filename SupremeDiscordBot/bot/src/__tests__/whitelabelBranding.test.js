// bot/src/__tests__/whitelabelBranding.test.js
// Брандирането РЕАЛНО стига до Discord.
//
// Дефектът, който този гейт пази (докладван от собственика, 07.08.2026):
// `customBotName`/`customBotAvatar` се записваха в базата и брандираха HTML
// транскрипта, но в целия бот единственото `client.user.*` извикване беше
// `setActivity`. Клиент плаща White-label, попълва име и снимка, интерфейсът
// казва „запазено“ — а ботът в Discord си остава със старото ЗАВИНАГИ.
//
// Класът е коварен: нищо не гърми, тестовете са зелени, базата е вярна. Липсва
// само ПОСЛЕДНОТО звено. Затова гейтът е структурен — че извикването изобщо
// съществува и е закачено на двата пътя.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "services", "clientManager.js"),
  "utf-8",
);
// Режем коментарите — обяснението горе съдържа същите имена.
const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");

describe("white-label брандирането стига до Discord", () => {
  it("ботът вика setUsername — иначе името е само ред в базата", () => {
    expect(code).toMatch(/\.setUsername\(/);
  });

  it("ботът вика setAvatar", () => {
    expect(code).toMatch(/\.setAvatar\(/);
  });

  it("чете брандирането от backend-а, не гадае", () => {
    expect(code).toMatch(/\/branding/);
  });

  it("прилага се и при ВДИГАНЕ, и при изрична смяна (два пътя)", () => {
    const calls = code.match(/applyBranding\(/g) || [];
    // дефиниция + поне две повиквания
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(code).toMatch(/applyBranding\([^)]*\{\s*withAvatar:\s*true/);
    expect(code).toMatch(/applyBranding\([^)]*\{\s*withAvatar:\s*false/);
  });

  it("името се сменя САМО при разлика — Discord дава ~2 смени на час", () => {
    // Сляпо прилагане при всеки boot изгаря лимита и после истинската промяна
    // не минава. Сравнението с текущото име е предпазителят.
    const fn = code.slice(code.indexOf("async function applyBranding"));
    expect(fn).toMatch(/username\s*!==/);
  });

  it("провалът НЕ поваля бота (без бранд той пак обслужва тикетите)", () => {
    const fn = code.slice(code.indexOf("async function applyBranding"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect((body.match(/catch/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
