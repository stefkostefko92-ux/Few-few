// backend/src/__tests__/launchData.test.js
// Готовност за пускане, поток И — автоматизация, интеграции, данни.
// Всеки тест носи номера на критерия от docs/LAUNCH_READINESS_SPEC.md.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "bot-secret-test";
process.env.DISCORD_SKU_PREMIUM = "sku_prem";
process.env.DISCORD_SKU_WHITELABEL = "sku_wl";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 86400_000;
const ago = (d) => new Date(Date.now() - d * DAY);

const { inExportWindow, exportWindowUntil, EXPORT_GRACE_DAYS } = await import("../lib/premium.js");
const discordEntitlementsRouter = (await import("../routes/discordEntitlements.js")).default;

function entApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/discord", discordEntitlementsRouter);
  return app;
}
const botPost = (path) => request(entApp()).post(path).set("x-bot-secret", "bot-secret-test");

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── А1 ──────────────────────────────────────────────────────────────────────
describe("А1 — край на абонамент през Discord дава прозорец за експорт", () => {
  /** Стейтфул мок на реда (както в discordEntitlements.test.js). */
  function discordServerRow() {
    let row = {
      id: "g1", isPremium: true, plan: "premium", planSource: "discord",
      stripeSubscriptionId: null, discordEntitlementId: "ent1", discordSkuId: "sku_prem",
      agencyId: null, agency: null, accessUntil: null, paidAccessEndedAt: null,
    };
    prismaMock.server.findUnique.mockImplementation(async () => ({ ...row }));
    prismaMock.server.update.mockImplementation(async ({ data }) => { row = { ...row, ...data }; return row; });
    return () => row;
  }

  it("А1: Discord revoke записва paidAccessEndedAt = ent.endsAt, а НЕ accessUntil", async () => {
    const getRow = discordServerRow();
    const endsAt = ago(2).getTime();

    const res = await botPost("/api/discord/entitlement").send({
      type: "delete",
      entitlement: { id: "ent1", skuId: "sku_prem", guildId: "g1", endsAt },
    });

    expect(res.body.revoked).toBe(true);
    expect(getRow().paidAccessEndedAt).toEqual(new Date(endsAt));
    // accessUntil вдига плана (getServerTier) — не го пипаме.
    expect(getRow().accessUntil).toBeNull();
    expect(getRow().plan).toBe("free");
  });

  it("А1: без ent.endsAt котвата е „сега“", async () => {
    const getRow = discordServerRow();
    const before = Date.now();

    await botPost("/api/discord/entitlement").send({
      type: "delete",
      entitlement: { id: "ent1", skuId: "sku_prem", guildId: "g1" },
    });

    const anchor = getRow().paidAccessEndedAt;
    expect(anchor).toBeInstanceOf(Date);
    expect(anchor.getTime()).toBeGreaterThanOrEqual(before);
    expect(anchor.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("А1: след Discord revoke прозорецът е отворен на 29-ия ден и затворен след 31-вия", async () => {
    const getRow = discordServerRow();
    await botPost("/api/discord/entitlement").send({
      type: "delete",
      entitlement: { id: "ent1", skuId: "sku_prem", guildId: "g1" },
    });
    const anchor = getRow().paidAccessEndedAt.getTime();

    expect(inExportWindow(getRow(), anchor + 29 * DAY)).toBe(true);
    expect(inExportWindow(getRow(), anchor + 31 * DAY)).toBe(false);
    // …а планът си остава free.
    expect(getRow().plan).toBe("free");
  });

  it("А1: inExportWindow взема paidAccessEndedAt (29 дни да, 31 дни не)", () => {
    expect(EXPORT_GRACE_DAYS).toBe(30);
    expect(inExportWindow({ paidAccessEndedAt: ago(29) })).toBe(true);
    expect(inExportWindow({ paidAccessEndedAt: ago(31) })).toBe(false);
  });

  it("А1: нов grant чисти paidAccessEndedAt (прозорецът не надживява нов платен период)", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      id: "g1", plan: "free", planSource: null, stripeSubscriptionId: null, discordEntitlementId: null,
    });

    await botPost("/api/discord/entitlement").send({
      type: "create",
      entitlement: { id: "ent2", skuId: "sku_prem", guildId: "g1", userId: "u1" },
    });

    expect(prismaMock.server.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paidAccessEndedAt: null }) }),
    );
  });

  it("А1: exportWindowUntil връща ISO края на прозореца или null (поле exportUntil в таблото)", () => {
    const ended = ago(5);
    expect(exportWindowUntil({ paidAccessEndedAt: ended })).toBe(
      new Date(ended.getTime() + EXPORT_GRACE_DAYS * DAY).toISOString(),
    );
    expect(exportWindowUntil({ paidAccessEndedAt: ago(40) })).toBeNull();
    expect(exportWindowUntil({})).toBeNull();
    expect(exportWindowUntil(null)).toBeNull();
  });

  it("А1: пътят за експорт чете paidAccessEndedAt от базата", () => {
    const src = readFileSync(join(SRC, "routes", "export.js"), "utf8");
    expect(src).toMatch(/select:\s*\{[^}]*paidAccessEndedAt/);
  });

  // Метлата е в services/scheduler.js (не е на поток И). Тестът е гейт: червен,
  // докато оркестраторът не добави paidAccessEndedAt в select-а на archive-cleanup.
  it("А1: метлата на архивите (scheduler.js) избира paidAccessEndedAt, иначе прозорецът е на хартия", () => {
    const src = readFileSync(join(SRC, "services", "scheduler.js"), "utf8");
    const block = src.slice(src.indexOf('"archive-cleanup"'), src.indexOf('"archive-cleanup"') + 1200);
    expect(block).toMatch(/paidAccessEndedAt/);
  });
});
