import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { defaultLiveOps } from "../src/config/liveops.js";
import { MemoryLiveOpsStore } from "../src/config/liveOpsStore.js";
import { AuthService } from "../src/auth/authService.js";
import { TokenService } from "../src/auth/tokens.js";
import { MemoryAuthRepository } from "../src/data/authRepository.js";
import { MemoryClanRepository } from "../src/data/clanRepository.js";
import { MemoryLedger } from "../src/data/ledger.js";
import { MemoryPlayerRepository } from "../src/data/memoryRepository.js";
import type { Rng } from "../src/domain/rng.js";
import { createApp } from "../src/http/app.js";
import { Catalog } from "../src/monetization/catalog.js";
import { ClanService } from "../src/services/clanService.js";
import { GameService } from "../src/services/gameService.js";

const ADMIN_KEY = "s3cr3t-admin";

// Rng that always returns min → pickByWeight selects "coin" → every spin is a
// 3× coin jackpot, making the live-tuning effect deterministic.
const jackpotRng: Rng = { intBetween: (min) => min, random: () => 0 };

describe("admin LiveOps", () => {
  let store: MemoryLiveOpsStore;
  let game: GameService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const repo = new MemoryPlayerRepository();
    store = new MemoryLiveOpsStore(defaultLiveOps);
    game = new GameService({ repo, ledger: new MemoryLedger(), liveOps: store, rng: jackpotRng });
    const tokens = new TokenService("test-secret-0123456789abcdef");
    const auth = new AuthService({ authRepo: new MemoryAuthRepository(), tokens, createPlayer: (n) => game.createPlayer(n) });
    const catalog = new Catalog();
    const clan = new ClanService({ clanRepo: new MemoryClanRepository(), playerRepo: repo });
    app = createApp({
      game,
      auth,
      tokens,
      iap: { redeem: async () => ({}), fulfil: async () => ({}) } as never,
      catalog,
      clan,
      liveOps: store,
      adminKey: ADMIN_KEY,
      webhookSecret: "wh",
    });
  });

  it("rejects admin access without the key", async () => {
    expect((await request(app).get("/admin/liveops")).status).toBe(403);
    expect((await request(app).get("/admin/liveops").set("x-admin-key", "wrong")).status).toBe(403);
  });

  it("returns the current config to an authorized admin", async () => {
    const res = await request(app).get("/admin/liveops").set("x-admin-key", ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.config.reelWeights.coin).toBe(defaultLiveOps.reelWeights.coin);
  });

  it("rejects an invalid config with a validation error", async () => {
    const bad = { ...defaultLiveOps, reelWeights: { ...defaultLiveOps.reelWeights, coin: -5 } };
    const res = await request(app).put("/admin/liveops").set("x-admin-key", ADMIN_KEY).send(bad);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("applies a valid config update live — next spin reflects it", async () => {
    // Baseline jackpot at island 0 = baseCoinValue * jackpotMultiplier.
    const player = await game.createPlayer("Hana");
    const first = await game.spin(player.id, 1);
    expect(first.outcome.coins).toBe(defaultLiveOps.payouts.baseCoinValue * defaultLiveOps.payouts.jackpotMultiplier);

    // Admin retunes the jackpot multiplier — no redeploy.
    const updated = {
      ...defaultLiveOps,
      payouts: { ...defaultLiveOps.payouts, jackpotMultiplier: 100 },
    };
    const put = await request(app).put("/admin/liveops").set("x-admin-key", ADMIN_KEY).send(updated);
    expect(put.status).toBe(200);
    expect(put.body.config.payouts.jackpotMultiplier).toBe(100);

    // The very next spin uses the new value — proof the GameService reads live.
    const second = await game.spin(player.id, 1);
    expect(second.outcome.coins).toBe(defaultLiveOps.payouts.baseCoinValue * 100);
  });
});
