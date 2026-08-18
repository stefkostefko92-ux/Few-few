// backend/src/__tests__/archiveCleanupBehaviour.test.js
// Метлата за архиви — ИЗПЪЛНЕНА, не прочетена.
//
// ЗАЩО СЪЩЕСТВУВА (Изпитателят, кръг 2, 07.08.2026): проверката, че метлата
// уважава прозореца за експорт, беше `toMatch(/continue/)` върху изрязано тяло
// на задачата. Доказано с мутация, че се геймва: махаш реалния `continue`,
// слагаш несвързан `if (false) { continue; }` някъде в среза — тестът остава
// зелен, а архивите на клиент, който още има право да си ги вземе, изчезват.
//
// Regex по сорса не може да съди ПОВЕДЕНИЕ. Затова тук прихващаме callback-а,
// който `scheduler.js` подава на `cron.schedule`, и го изпълняваме наистина.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

// Прихващаме регистрациите: `scheduler.js` вика `cron.schedule(израз, fn, TZ)`
// на ниво модул. Пазим fn по реда на регистрация — Job 1 е archive-cleanup.
const jobs = [];
vi.mock("node-cron", () => ({
  default: { schedule: (expr, fn) => { jobs.push({ expr, fn }); return { stop: () => {} }; } },
}));

// Ботът не бива да се вика от този тест.
vi.mock("../services/botNotifier.js", () => ({
  notifyBot: vi.fn(), dmUser: vi.fn(), reconcileWhitelabel: vi.fn(),
}));

await import("../services/scheduler.js");
const archiveCleanup = jobs[0].fn;

const DAY = 86400_000;
const ago = (d) => new Date(Date.now() - d * DAY);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.ticket.updateMany.mockResolvedValue({ count: 3 });
});

/** @param {Array} servers редовете, които заявката за метлата връща */
async function sweep(servers) {
  prismaMock.server.findMany.mockResolvedValue(servers);
  await archiveCleanup();
  // Кои serverId-та реално са били почистени
  return prismaMock.ticket.updateMany.mock.calls.map((c) => c[0].where.serverId);
}

describe("прозорецът за експорт спира метлата", () => {
  it("сървър, отменен вчера, НЕ се чисти — клиентът още има право на данните", async () => {
    const swept = await sweep([{ id: "пресен", archiveRetentionDays: 30, accessUntil: ago(1), trialEndsAt: null }]);
    expect(swept).toEqual([]);
  });

  it("сървър 29 дни след края — още защитен", async () => {
    const swept = await sweep([{ id: "s29", archiveRetentionDays: 30, accessUntil: ago(29), trialEndsAt: null }]);
    expect(swept).toEqual([]);
  });

  it("сървър 31 дни след края — прозорецът е затворен, чисти се", async () => {
    const swept = await sweep([{ id: "s31", archiveRetentionDays: 30, accessUntil: ago(31), trialEndsAt: null }]);
    expect(swept).toEqual(["s31"]);
  });

  it("изтекла проба също държи прозореца отворен", async () => {
    const swept = await sweep([{ id: "проба", archiveRetentionDays: 30, accessUntil: null, trialEndsAt: ago(5) }]);
    expect(swept).toEqual([]);
  });

  it("сървър без нито една котва се чисти нормално (никога не е плащал)", async () => {
    const swept = await sweep([{ id: "безплатен", archiveRetentionDays: 30, accessUntil: null, trialEndsAt: null }]);
    expect(swept).toEqual(["безплатен"]);
  });

  it("смесена партида: чисти САМО тези извън прозореца", async () => {
    const swept = await sweep([
      { id: "пази-1", archiveRetentionDays: 30, accessUntil: ago(2),  trialEndsAt: null },
      { id: "чисти-1", archiveRetentionDays: 30, accessUntil: ago(40), trialEndsAt: null },
      { id: "пази-2", archiveRetentionDays: 30, accessUntil: null,     trialEndsAt: ago(10) },
      { id: "чисти-2", archiveRetentionDays: 30, accessUntil: null,    trialEndsAt: null },
    ]);
    expect(swept).toEqual(["чисти-1", "чисти-2"]);
  });
});

describe("самото чистене си остава вярно", () => {
  it("реже само ЗАТВОРЕНИ тикети отвъд срока, и само техния HTML", async () => {
    await sweep([{ id: "s", archiveRetentionDays: 30, accessUntil: null, trialEndsAt: null }]);
    const args = prismaMock.ticket.updateMany.mock.calls[0][0];
    expect(args.where.status).toEqual({ in: ["CLOSED", "ARCHIVED"] });
    expect(args.where.archiveHtml).toEqual({ not: null });
    expect(args.data).toEqual({ archiveHtml: null });
    // Границата се смята от срока на сървъра, не от константа.
    const cutoff = args.where.closedAt.lt.getTime();
    expect(Math.abs(Date.now() - cutoff - 30 * DAY)).toBeLessThan(5000);
  });

  it("различен срок на сървъра дава различна граница", async () => {
    await sweep([{ id: "s", archiveRetentionDays: 7, accessUntil: null, trialEndsAt: null }]);
    const cutoff = prismaMock.ticket.updateMany.mock.calls[0][0].where.closedAt.lt.getTime();
    expect(Math.abs(Date.now() - cutoff - 7 * DAY)).toBeLessThan(5000);
  });

  it("провалът се ЧУВА — не се гълта мълчаливо", async () => {
    // `jobFail` праща в Sentry; тук доказваме, че задачата не хвърля навън и
    // не оставя грешката без следа в конзолата.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.server.findMany.mockRejectedValue(new Error("базата падна"));
    await expect(archiveCleanup()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
