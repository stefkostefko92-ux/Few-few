import { describe, expect, it } from "vitest";
import request from "supertest";
import { defaultLiveOps } from "../src/config/liveops.js";
import { MemoryLedger } from "../src/data/ledger.js";
import { MemoryPlayerRepository } from "../src/data/memoryRepository.js";
import { createApp } from "../src/http/app.js";
import { GameService } from "../src/services/gameService.js";

function makeApp() {
  const game = new GameService({
    repo: new MemoryPlayerRepository(),
    ledger: new MemoryLedger(),
    config: defaultLiveOps,
  });
  return createApp(game);
}

describe("HTTP API", () => {
  it("GET /health returns ok", async () => {
    const res = await request(makeApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("publishes gacha drop rates (regulatory transparency §12.2)", async () => {
    const res = await request(makeApp()).get("/gacha/rates");
    expect(res.status).toBe(200);
    const { rates, pity } = res.body;
    const sum = rates.common + rates.rare + rates.epic + rates.mythic;
    expect(sum).toBeCloseTo(1, 6);
    expect(pity.mythic).toBe(defaultLiveOps.gacha.mythicPity);
  });

  it("creates a player and reads /me with the returned id", async () => {
    const app = makeApp();
    const created = await request(app).post("/players").send({ name: "Hana" });
    expect(created.status).toBe(201);
    const id = created.body.player.id;
    expect(created.body.player.spins).toBe(defaultLiveOps.spins.startingBonus);

    const me = await request(app).get("/me").set("x-player-id", id);
    expect(me.status).toBe(200);
    expect(me.body.player.id).toBe(id);
  });

  it("spin decrements spins and never leaks predetermined raid data", async () => {
    const app = makeApp();
    const created = await request(app).post("/players").send({ name: "Hana" });
    const id = created.body.player.id;
    const before = created.body.player.spins;

    const res = await request(app).post("/spin").set("x-player-id", id).send({ betMultiplier: 1 });
    expect(res.status).toBe(200);
    expect(res.body.player.spins).toBe(before - 1);
    expect(res.body.outcome.reels).toHaveLength(3);
    // pendingRaid, if present, exposes only a spot COUNT — never the hidden values.
    if (res.body.player.pendingRaid) {
      expect(typeof res.body.player.pendingRaid.spots).toBe("number");
    }
  });

  it("rejects unauthenticated access with 401", async () => {
    const res = await request(makeApp()).get("/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an invalid bet with a validation error", async () => {
    const app = makeApp();
    const created = await request(app).post("/players").send({ name: "Hana" });
    const id = created.body.player.id;
    const res = await request(app).post("/spin").set("x-player-id", id).send({ betMultiplier: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(makeApp()).get("/nope");
    expect(res.status).toBe(404);
  });
});
