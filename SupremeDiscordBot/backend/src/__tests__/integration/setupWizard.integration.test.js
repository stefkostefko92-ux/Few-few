// backend/src/__tests__/integration/setupWizard.integration.test.js
// `/setup wizard` → чернова на панел срещу ЖИВ Postgres (28.11.2026).
// Мокът не доказва, че полетата съществуват в схемата (categoryOpenId, logChannelId,
// вложеният бутон), нито че лимитът на Free (1 панел) държи при две едновременни заявки.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { prisma, resetDb, makeServer } from "./db.js";

process.env.API_SECRET = process.env.API_SECRET || "integration-secret";

const botSetup = (await import("../../routes/bot_setup.js")).default;
const app = () => {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", botSetup);
  a.use((e, _q, r, _n) => r.status(500).json({ error: e.message }));
  return a;
};
const SID = "333333333333333333";
const body = {
  userId: "111111111111111111",
  roleIds: [SID, "555555555555555551"],
  categoryId: "700000000000000001",
  logChannelId: "800000000000000001",
  name: "Поддръжка", title: "Поддръжка", description: "Натисни бутона.", buttonLabel: "Отвори билет",
};
const go = () => request(app()).post(`/api/bot/setup-wizard/${SID}`).set("x-bot-secret", process.env.API_SECRET).send(body);

beforeEach(async () => {
  await resetDb();
  await makeServer({ id: SID });
});
afterAll(async () => { await prisma.$disconnect(); });

describe("съветникът — жива база", () => {
  it("записва панела с ролите, категорията, лог канала и един бутон; не е публикуван", async () => {
    const r = await go();
    expect(r.status).toBe(201);
    const p = await prisma.panel.findUnique({ where: { id: r.body.id }, include: { buttons: true } });
    expect(p).toMatchObject({
      serverId: SID, name: "Поддръжка", supportRoleIds: ["555555555555555551"],
      categoryOpenId: "700000000000000001", logChannelId: "800000000000000001", channelId: null, messageId: null,
    });
    expect(p.buttons.map((b) => [b.label, b.style])).toEqual([["Отвори билет", "PRIMARY"]]);
  });
  it("Free: две едновременни заявки → един панел", async () => {
    const [a, b] = await Promise.all([go(), go()]);
    expect([a.status, b.status].sort()).toEqual([201, 403]);
    expect(await prisma.panel.count({ where: { serverId: SID } })).toBe(1);
  });
  it("без тайната на бота → 401/403, нищо не се записва", async () => {
    const r = await request(app()).post(`/api/bot/setup-wizard/${SID}`).send(body);
    expect([401, 403]).toContain(r.status);
    expect(await prisma.panel.count()).toBe(0);
  });
});
