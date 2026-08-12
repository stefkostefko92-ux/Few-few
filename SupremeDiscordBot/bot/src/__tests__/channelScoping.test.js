// bot/src/__tests__/channelScoping.test.js
// Резолвирането на канал минава през guild-а, не през целия бот.
//
// РИСКЪТ (документиран в самия index.js): `client.channels.fetch(id)` търси
// през ВСИЧКИ guild-ове, в които е ботът. Това е СПОДЕЛЕН бот — значи чужди
// сървъри. Затова съществува помощникът `guildChannel(serverId, channelId)`,
// който резолвира В РАМКИТЕ на guild-а и отказва канал от друг сървър.
//
// СЪСТОЯНИЕ КЪМ ОДИТ ЕТАП 6 (12.08.2026): половината вътрешни маршрути ползват
// помощника, другата половина резолвират глобално. Проверено е, че днес това
// НЕ е жива дупка — backend-ът подава `channelId`, взет от базата и вече
// скопиран по serverId. Тоест рискът е ЛАТЕНТЕН: първият маршрут, който подаде
// потребителски channelId, го превръща в cross-tenant публикуване.
//
// Затварянето на останалите иска съгласувана промяна и в backend-а (тези
// маршрути НЕ получават `serverId` в тялото), затова е отделна задача. Дотогава
// този тест е ОГРАНИЧИТЕЛ: прави дълга видим и не позволява да расте.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "index.js");

// Базова линия, измерена при одита. Числото има право да ПАДА (затваряме дълг),
// но не и да расте — нов глобален резолв значи нов латентен cross-tenant път.
const BASELINE_GLOBAL_RESOLVES = 12;

describe("скоупване на каналите в споделен бот", () => {
  const src = readFileSync(INDEX, "utf8");
  const globalResolves = (src.match(/client\.channels\.(?:cache\.get|fetch)\(/g) || []).length;
  const scopedResolves = (src.match(/await guildChannel\(/g) || []).length;

  it("помощникът guildChannel съществува и се ползва", () => {
    expect(src).toMatch(/async function guildChannel\(/);
    expect(scopedResolves).toBeGreaterThan(0);
  });

  it("глобалните резолви НЕ растат над измерената база", () => {
    expect(
      globalResolves,
      `нов глобален резолв на канал (${globalResolves} > ${BASELINE_GLOBAL_RESOLVES}). ` +
      "Ползвай guildChannel(serverId, channelId) — иначе каналът се търси през " +
      "ВСИЧКИ сървъри на бота и потребителски channelId става cross-tenant път.",
    ).toBeLessThanOrEqual(BASELINE_GLOBAL_RESOLVES);
  });

  it("guildChannel наистина проверява принадлежността към guild-а", () => {
    const fn = src.slice(src.indexOf("async function guildChannel("));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    // Без тази проверка помощникът е само по-дълъг начин да се резолвира глобално.
    expect(body).toMatch(/guilds\.(cache\.get|fetch)/);
  });
});
