// backend/src/__tests__/integration/supportInvite.integration.test.js
// Поканата за поддръжка срещу ЖИВ Postgres.
//
// ЗАЩО е тук, а не само при моковете: мокът приема всяка форма на заявка. Тук се
// вижда, че миграцията v56 наистина създава таблицата, че записът е един ред по
// ключ (upsert, не натрупване) и че `/support` чете точно него — включително когато
// редът е подправен на ръка в базата.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { prisma, resetDb } from "./db.js";

const { getSupportInviteUrl, setSupportInviteUrl, SUPPORT_INVITE_KEY, SUPPORT_FALLBACK_PATH } = await import("../../lib/supportInvite.js");
const { _resetPlatformSettingsCache } = await import("../../lib/platformSettings.js");
const supportRouter = (await import("../../routes/support.js")).default;

const app = express();
app.use("/support", supportRouter);
const rows = () => prisma.$queryRaw`SELECT "key", "value" FROM "platform_settings"`;

beforeEach(async () => {
  await resetDb();
  _resetPlatformSettingsCache();
});
afterAll(async () => { await prisma.$disconnect(); });

describe("поканата за поддръжка — жива база", () => {
  it("празна таблица → /support води към ръководствата", async () => {
    expect(await rows()).toEqual([]);
    const r = await request(app).get("/support");
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe(SUPPORT_FALLBACK_PATH);
  });

  it("запис → един ред по ключ; втори запис го заменя, не трупа", async () => {
    await setSupportInviteUrl("https://discord.gg/first");
    await setSupportInviteUrl("https://discord.gg/second");
    expect(await rows()).toEqual([{ key: SUPPORT_INVITE_KEY, value: "https://discord.gg/second" }]);
    // Четене покрай кеша — стойността е наистина в базата, не само в паметта.
    _resetPlatformSettingsCache();
    expect(await getSupportInviteUrl()).toBe("https://discord.gg/second");
    const r = await request(app).get("/support");
    expect(r.headers.location).toBe("https://discord.gg/second");
    expect(r.headers["cache-control"]).toContain("no-store");
  });

  it("махане → редът изчезва и /support пак води към ръководствата", async () => {
    await setSupportInviteUrl("https://discord.gg/first");
    await setSupportInviteUrl(null);
    expect(await rows()).toEqual([]);
    _resetPlatformSettingsCache();
    expect((await request(app).get("/support")).headers.location).toBe(SUPPORT_FALLBACK_PATH);
  });

  it("подправен ред в базата не превръща /support в пренасочване към чужд сайт", async () => {
    await prisma.$executeRaw`INSERT INTO "platform_settings" ("key", "value", "updatedAt") VALUES (${SUPPORT_INVITE_KEY}, 'https://evil.example/phish', NOW())`;
    const r = await request(app).get("/support");
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe(SUPPORT_FALLBACK_PATH);
  });
});
