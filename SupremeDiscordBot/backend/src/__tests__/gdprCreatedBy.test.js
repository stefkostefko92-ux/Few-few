// backend/src/__tests__/gdprCreatedBy.test.js
// Всеки модел, който пази КОЙ е направил записа, влиза в чл. 15 експорта.
//
// ДЕФЕКТЪТ (одит, 16.08.2026): експортът покриваше какво човекът е ПОЛУЧИЛ или
// ПРЕТЪРПЯЛ (тикети, кандидатури, гласове, снимки на роли), но не и какво е
// СЪЗДАЛ. Седем модела пазеха `creatorId`/`createdBy` извън обхвата: Poll,
// Giveaway, ScheduledMessage, StickyMessage, CannedResponse, Webhook,
// KbArticle. „Този човек е направил това, тогава, на този сървър" е лична
// данна за същия субект и чл. 15(1) иска копие и от нея.
//
// Гейтът чете СХЕМАТА, не списък в теста: списък би дрейфнал заедно с кода,
// който трябва да пази. Нов модел с такова поле пада гейта, докато някой не
// реши съзнателно какво да прави с него.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CREATED_BY_MODELS } from "../routes/gdpr.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(SRC, "..", "prisma", "schema.prisma"), "utf8");
const gdpr = readFileSync(join(SRC, "routes", "gdpr.js"), "utf8");

/** Полета, които сочат КОНКРЕТЕН човек. */
const OWNER_FIELDS = /^\s*(creatorId|createdBy|authorId|reviewedBy|claimedBy)\s+String/m;

const modelsWithOwner = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
  .filter(([, , body]) => OWNER_FIELDS.test(body))
  .map(([, name]) => name);

const lower = (n) => n[0].toLowerCase() + n.slice(1);

describe("чл. 15 покрива и „създаденото от мен“", () => {
  it("схемата изобщо има такива модели (иначе тестът е сляп)", () => {
    expect(modelsWithOwner.length).toBeGreaterThanOrEqual(7);
  });

  it("всеки модел с „кой го създаде“ е в експорта", () => {
    const covered = new Set(CREATED_BY_MODELS.map(([m]) => m));
    const missing = modelsWithOwner
      .map(lower)
      .filter((m) => !covered.has(m) && !gdpr.includes(`prisma.${m}.`));
    expect(
      missing,
      `нов модел с лични данни извън чл. 15: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("НИКОЙ select не изнася тайна или чужд адрес", () => {
    // Webhook носи `secret` и `url`. Те не са лична данна за субекта и нямат
    // работа във файл, който се сваля — точно тук е лесно да се пропуснат.
    for (const [model, , select] of CREATED_BY_MODELS) {
      for (const forbidden of ["secret", "url", "token", "keyHash", "password"]) {
        expect(
          Object.keys(select),
          `${model}: изнася ${forbidden}`,
        ).not.toContain(forbidden);
      }
      expect(Object.keys(select).length, `${model}: празен select = цял ред`).toBeGreaterThan(0);
    }
  });

  it("редът в масива съвпада с реда на деструктурирането", () => {
    // РЕДЪТ Е ДОГОВОР: същият масив пълни `Promise.all`. Разместване тук без
    // разместване там разменя данните между полета — тихо и правдоподобно
    // (полетата са с еднакъв вид, никой тест няма да гръмне от само себе си).
    const m = gdpr.match(/polls,\s*giveaways,\s*scheduledMessages,\s*stickyMessages,\s*cannedResponses,\s*webhooks,\s*kbArticles/);
    expect(m, "не намирам деструктурирането — преименувано?").not.toBeNull();
    const order = CREATED_BY_MODELS.map(([x]) => x);
    expect(order).toEqual([
      "poll", "giveaway", "scheduledMessage", "stickyMessage",
      "cannedResponse", "webhook", "kbArticle",
    ]);
  });
});
