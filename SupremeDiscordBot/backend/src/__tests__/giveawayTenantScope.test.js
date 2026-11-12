// backend/src/__tests__/giveawayTenantScope.test.js
// Cross-tenant IDOR: /giveaway end|reroll трябва да са скоупнати по serverId.
// Ботът е СПОДЕЛЕН (един x-bot-secret за всички сървъри), а giveaway_id е
// свободен текст от slash командата — ManageGuild админ на сървър A не бива да
// може да приключи/претегли подарък на сървър B, като познае/получи cuid-а.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({
  requireBotSecret: (_req, _res, next) => next(),
}));
vi.mock("../services/webhooks.js", () => ({ fireWebhooks: vi.fn().mockResolvedValue(undefined) }));
const notifyBot = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/botNotifier.js", () => ({ notifyBot }));
vi.mock("../lib/game/xp.js", () => ({ grantXpOnce: vi.fn(), XP_REWARDS: {} }));
vi.mock("../lib/premium.js", () => ({ getServerTier: vi.fn(), planHasFeature: vi.fn() }));

const { default: router } = await import("../routes/bot_v18.js");

const SERVER_A = "111111111111111111";
const SERVER_B = "222222222222222222";
const GID = "giveaway_of_A";

// Малка in-memory "таблица": подаръкът принадлежи на A. findFirst/findUnique
// уважават where, така че липсващ serverId-скоуп в кода се вижда като теглене.
const row = {
  id: GID, serverId: SERVER_A, prize: "Nitro", channelId: "c", messageId: "m",
  winnerCount: 1, endedAt: null, winnerIds: [], entries: [{ userId: "u1" }, { userId: "u2" }],
};
const matches = (where = {}) =>
  Object.entries(where).every(([k, v]) => row[k] === v);

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", router);
  a.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.giveaway.findUnique.mockImplementation(async ({ where }) => (matches(where) ? row : null));
  prismaMock.giveaway.findFirst.mockImplementation(async ({ where }) => (matches(where) ? row : null));
  prismaMock.giveaway.updateMany.mockResolvedValue({ count: 1 });
});

for (const sub of ["end", "reroll"]) {
  describe(`POST /giveaway/:id/${sub}`, () => {
    const url = `/api/bot/giveaway/${GID}/${sub}`;

    it("липсващ serverId -> 400, нищо не се тегли", async () => {
      const res = await request(app()).post(url).send({ actorId: "x" });
      expect(res.status).toBe(400);
      expect(prismaMock.giveaway.updateMany).not.toHaveBeenCalled();
    });

    it("serverId на ЧУЖД сървър (B) -> 404, победители не се теглят", async () => {
      const res = await request(app()).post(url).send({ actorId: "x", serverId: SERVER_B });
      expect(res.status).toBe(404);
      expect(prismaMock.giveaway.updateMany).not.toHaveBeenCalled();
    });

    it("serverId, който не е низ (обект) -> 400", async () => {
      const res = await request(app()).post(url).send({ serverId: { not: "" } });
      expect(res.status).toBe(400);
      expect(prismaMock.giveaway.updateMany).not.toHaveBeenCalled();
    });

    it("правилният сървър (A) -> 200 и се записва", async () => {
      const res = await request(app()).post(url).send({ actorId: "x", serverId: SERVER_A });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.winners)).toBe(true);
      expect(prismaMock.giveaway.updateMany).toHaveBeenCalledTimes(1);
    });

    it("notifyBot получава serverId (иначе ботът не резолвира канала и не обявява)", async () => {
      await request(app()).post(url).send({ serverId: SERVER_A });
      expect(notifyBot).toHaveBeenCalledWith(
        "GIVEAWAY_ENDED",
        expect.objectContaining({ serverId: SERVER_A, channelId: "c", giveawayId: GID }),
      );
    });
  });
}

describe("двоен край (race): условен запис", () => {
  const url = `/api/bot/giveaway/${GID}/end`;

  it("end: записът е условен по {id, serverId, endedAt: null}", async () => {
    await request(app()).post(url).send({ serverId: SERVER_A });
    expect(prismaMock.giveaway.updateMany.mock.calls[0][0].where)
      .toEqual({ id: GID, serverId: SERVER_A, endedAt: null });
  });

  it("reroll: НЕ изисква endedAt: null", async () => {
    await request(app()).post(`/api/bot/giveaway/${GID}/reroll`).send({ serverId: SERVER_A });
    expect(prismaMock.giveaway.updateMany.mock.calls[0][0].where)
      .toEqual({ id: GID, serverId: SERVER_A });
  });

  it("друг вече е приключил между четенето и записа (count 0) -> 409, без notify/webhook", async () => {
    prismaMock.giveaway.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app()).post(url).send({ serverId: SERVER_A });
    expect(res.status).toBe(409);
    expect(notifyBot).not.toHaveBeenCalled();
  });

  it("вече приключил при четене -> 409 (не 500), без notify", async () => {
    prismaMock.giveaway.findFirst.mockResolvedValue({ ...row, endedAt: new Date() });
    const res = await request(app()).post(url).send({ serverId: SERVER_A });
    expect(res.status).toBe(409);
    expect(prismaMock.giveaway.updateMany).not.toHaveBeenCalled();
    expect(notifyBot).not.toHaveBeenCalled();
  });
});
