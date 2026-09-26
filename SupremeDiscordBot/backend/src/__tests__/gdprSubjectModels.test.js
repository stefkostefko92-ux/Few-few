// backend/src/__tests__/gdprSubjectModels.test.js
// Всеки модел, който пази Discord ID на СУБЕКТА (userId/fromUserId/toUserId),
// е покрит и от експорта (чл. 15/20), и от изтриването от таблото (чл. 17).
//
// ДЕФЕКТЪТ (одит на Кодаджията и Правния Разбирач, 25.09.2026): v50 добави
// седем модела на играта и обнови само dsr.js (бот /privacy + админ).
// routes/gdpr.js — експортът и изтриването от ТАБЛОТО — не ги познаваше:
// „всички лични данни“ без играта, а изтритият акаунт оставаше с профила си.
// Гейтът чете СХЕМАТА — нов модел с такова поле пада, докато някой не реши
// съзнателно къде влиза.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(SRC, "..", "prisma", "schema.prisma"), "utf8");
const gdpr = readFileSync(join(SRC, "routes", "gdpr.js"), "utf8");
const gamePrivacy = readFileSync(join(SRC, "lib", "game", "privacy.js"), "utf8");
const exportAndErase = gdpr + "\n" + gamePrivacy;

const SUBJECT_FIELD = /^\s*(userId|fromUserId|toUserId)\s+String/m;
// Модели, чийто userId НЕ е субект на таблото, или които са съзнателно извън
// експорта (с причина). Всеки ред тук е решение, не пропуск.
// Днес е празно — всеки модел е покрит.
const NOT_SUBJECT = new Map();

const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
  .filter(([, , body]) => SUBJECT_FIELD.test(body))
  .map(([, name]) => name);
const lower = (n) => n[0].toLowerCase() + n.slice(1);

describe("чл. 15 и чл. 17 от таблото покриват всеки модел със субект", () => {
  it("схемата има такива модели, включително играта (иначе тестът е сляп)", () => {
    expect(models).toEqual(expect.arrayContaining(["MemberProgress", "MemberCompanion", "ShopPurchase", "TriviaAnswer", "CompanionTrade"]));
  });

  it("всеки такъв модел се чете в експорта", () => {
    const missing = models.filter((m) => !NOT_SUBJECT.has(m) && !exportAndErase.includes(`prisma.${lower(m)}.find`));
    expect(missing, `модел със субект извън чл. 15 експорта: ${missing.join(", ")}`).toEqual([]);
  });

  it("експортът и изтриването от таблото минават през общия модул на играта", () => {
    expect(gdpr).toMatch(/gameDataFor\(userId\)/);
    expect(gdpr).toMatch(/server_season_game:\s*game/);
    expect(gdpr).toMatch(/gameEraseSteps\(tx, userId\)/);
  });

  it("всеки модел на играта с субект има стъпка за изтриване", () => {
    for (const m of ["memberProgress", "gameXpGrant", "memberCompanion", "shopPurchase", "questContribution", "triviaAnswer", "companionTrade"]) {
      expect(gamePrivacy, `${m}: няма deleteMany`).toMatch(new RegExp(`tx\\.${m}\\.deleteMany`));
    }
  });
});
