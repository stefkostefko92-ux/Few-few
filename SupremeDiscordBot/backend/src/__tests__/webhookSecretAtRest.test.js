// backend/src/__tests__/webhookSecretAtRest.test.js
// Тайната за подпис на webhook: шифрована при покой, никога върната на клиента,
// и с изричен договор за „не пипай / махни / смени".
//
// ДЕФЕКТИТЕ (одит по сигурност, 08.09.2026):
//   1. `Webhook.secret` стоеше в ОТКРИТ ТЕКСТ в базата (OAuth токените са с
//      AES-256-GCM; тази тайна — не). Записано като остатък в ROPA, дейност 16.
//   2. GET/POST/PUT връщаха реда ЦЯЛ, с тайната, на всеки с ManageGuild —
//      сесия, разширение в браузъра, снимка на екрана.
//   3. Клиентът пращаше `secret: null` при ВСЯКО редактиране с празно поле —
//      смяна на име или събития тихо триеше тайната и подписването спираше.
//      (Това се проявява само с „не пипай" семантика; преди беше маскирано от
//      факта, че полето се пре-попълваше с върнатата тайна.)
//
// Тестовете са ПОВЕДЕНЧЕСКИ: през реалния Express маршрут и реалния
// `encrypt`/`decryptSafe`, с мокната само базата.
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "u1", globalRole: "USER" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
}));
vi.mock("../lib/premium.js", () => ({
  requirePremium: () => (_req, _res, next) => next(),
  getServerTier: async () => ({ plan: "premium", limits: { webhooks: 10 } }),
  planHasFeature: () => true,
}));

const { default: router } = await import("../routes/webhooks.js");
const { decryptSafe } = await import("../lib/crypto.js");

const SID = "111111111111111111";
const HOOK = { id: "w1", serverId: SID, name: "n", url: "https://example.com/h", events: ["TICKET_OPEN"], enabled: true, createdBy: "u1" };

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/servers", router);
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.webhook.count.mockResolvedValue(0);
  prismaMock.webhook.findFirst.mockResolvedValue({ id: "w1" });
  prismaMock.webhook.create.mockImplementation(async ({ data }) => ({ ...HOOK, ...data }));
  prismaMock.webhook.update.mockImplementation(async ({ data }) => ({ ...HOOK, secret: "enc", ...data }));
});

describe("тайната се шифрова при запис", () => {
  it("POST: в базата влиза шифротекст, не подадената тайна", async () => {
    await request(app()).post(`/api/servers/${SID}/webhooks`)
      .send({ name: "n", url: "https://example.com/h", events: ["TICKET_OPEN"], secret: "top-secret" })
      .expect(201);
    const stored = prismaMock.webhook.create.mock.calls[0][0].data.secret;
    expect(stored).not.toBe("top-secret");
    expect(stored).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i); // iv:tag:тяло
    expect(decryptSafe(stored)).toBe("top-secret");
  });

  it("POST без тайна не записва празен шифротекст", async () => {
    await request(app()).post(`/api/servers/${SID}/webhooks`)
      .send({ name: "n", url: "https://example.com/h", events: ["TICKET_OPEN"] })
      .expect(201);
    expect(prismaMock.webhook.create.mock.calls[0][0].data.secret).toBeUndefined();
  });
});

describe("тайната НИКОГА не се връща", () => {
  it("GET списък: `hasSecret`, без `secret`", async () => {
    prismaMock.webhook.findMany.mockResolvedValue([{ ...HOOK, secret: "enc" }, { ...HOOK, id: "w2", secret: null }]);
    const r = await request(app()).get(`/api/servers/${SID}/webhooks`).expect(200);
    expect(r.body.map((h) => h.hasSecret)).toEqual([true, false]);
    for (const h of r.body) expect(h).not.toHaveProperty("secret");
    expect(JSON.stringify(r.body)).not.toContain("enc");
  });

  it("POST и PUT отговарят без `secret`", async () => {
    const c = await request(app()).post(`/api/servers/${SID}/webhooks`)
      .send({ name: "n", url: "https://example.com/h", events: ["TICKET_OPEN"], secret: "s" }).expect(201);
    expect(c.body).not.toHaveProperty("secret");
    expect(c.body.hasSecret).toBe(true);
    const u = await request(app()).put(`/api/servers/${SID}/webhooks/w1`).send({ name: "m" }).expect(200);
    expect(u.body).not.toHaveProperty("secret");
  });
});

describe("договорът при редакция: липсва = не пипай · null = махни · низ = смени", () => {
  it("тяло без `secret` НЕ пипа тайната", async () => {
    await request(app()).put(`/api/servers/${SID}/webhooks/w1`).send({ name: "m" }).expect(200);
    expect(prismaMock.webhook.update.mock.calls[0][0].data).not.toHaveProperty("secret");
  });

  it("`secret: null` я маха", async () => {
    await request(app()).put(`/api/servers/${SID}/webhooks/w1`).send({ secret: null }).expect(200);
    expect(prismaMock.webhook.update.mock.calls[0][0].data.secret).toBeNull();
  });

  it("низ я сменя и новата е шифрована", async () => {
    await request(app()).put(`/api/servers/${SID}/webhooks/w1`).send({ secret: "new" }).expect(200);
    const stored = prismaMock.webhook.update.mock.calls[0][0].data.secret;
    expect(stored).not.toBe("new");
    expect(decryptSafe(stored)).toBe("new");
  });
});

describe("доставката подписва и със заварена plaintext тайна, и с шифрована", () => {
  it("decryptSafe пуска стар открит текст непроменен и дешифрира новия формат", async () => {
    const { encrypt } = await import("../lib/crypto.js");
    expect(decryptSafe("legacy-plaintext-secret")).toBe("legacy-plaintext-secret");
    expect(decryptSafe(encrypt("fresh"))).toBe("fresh");
    // Миграцията е „при следващ запис", не еднократен скрипт: заварените редове
    // продължават да подписват, докато собственикът не смени тайната.
  });

  it("services/webhooks.js подписва през decryptSafe, не през суровото поле", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "services", "webhooks.js"), "utf8");
    const sign = src.slice(src.indexOf("async function deliverWebhook"), src.indexOf("X-SupremeBot-Signature"));
    expect(sign).toMatch(/decryptSafe\(hook\.secret\)/);
    expect(sign).not.toMatch(/createHmac\([^)]*hook\.secret/);
  });
});
