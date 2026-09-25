// bot/src/__tests__/channelScoping.test.js
// Резолвирането на канал минава през guild-а, не през целия бот.
//
// РИСКЪТ (документиран в самия index.js): `client.channels.fetch(id)` търси
// през ВСИЧКИ guild-ове, в които е ботът. Това е СПОДЕЛЕН бот — значи чужди
// сървъри. Затова съществува помощникът `guildChannel(serverId, channelId)`,
// който резолвира В РАМКИТЕ на guild-а и отказва канал от друг сървър.
//
// СЪСТОЯНИЕ: ЗАТВОРЕНО (12.08.2026). При етап 6 половината вътрешни маршрути
// резолвираха глобално (12 места). Не беше жива дупка — backend-ът подаваше
// channelId от базата, вече скопиран — но беше латентен път: първият маршрут с
// потребителски channelId го превръщаше в cross-tenant публикуване.
//
// Затварянето поиска съгласувана промяна: backend-ът вече праща `serverId` и
// при TICKET_REPLY, TICKET_ASSIGNED, POLL_UPDATE и AI_REPLY, а ботът резолвира
// през guildChannel навсякъде. Базата е 0 — тестът вече не търпи НИТО ЕДИН нов
// глобален резолв.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "index.js");

// Базова линия, измерена при одита. Числото има право да ПАДА (затваряме дълг),
// но не и да расте — нов глобален резолв значи нов латентен cross-tenant път.
const BASELINE_GLOBAL_RESOLVES = 0;

describe("скоупване на каналите в споделен бот", () => {
  const src = readFileSync(INDEX, "utf8");
  // Коментарите НЕ се броят: файлът обяснява точно този риск с думите
  // `client.channels.fetch(id)`, и наивното броене наказваше документацията,
  // вместо кода. Гейт, който кара човек да ИЗТРИЕ обяснението, за да мине,
  // работи срещу себе си.
  const codeOnly = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const globalResolves = (codeOnly.match(/client\.channels\.(?:cache\.get|fetch)\(/g) || []).length;
  const scopedResolves = (codeOnly.match(/await guildChannel\(/g) || []).length;

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
