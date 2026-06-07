import { beforeEach, describe, expect, it } from "vitest";
import { defaultLiveOps } from "../src/config/liveops.js";
import { MemoryLiveOpsStore } from "../src/config/liveOpsStore.js";
import { AuthService } from "../src/auth/authService.js";
import { TokenService } from "../src/auth/tokens.js";
import { MemoryAnalytics } from "../src/analytics/analytics.js";
import { MemoryAuthRepository } from "../src/data/authRepository.js";
import { MemoryLedger } from "../src/data/ledger.js";
import { MemoryPlayerRepository } from "../src/data/memoryRepository.js";
import { MemoryPurchaseRepository } from "../src/data/purchaseRepository.js";
import type { Rng } from "../src/domain/rng.js";
import { Catalog } from "../src/monetization/catalog.js";
import { StubReceiptValidator } from "../src/monetization/receipts.js";
import { GameService } from "../src/services/gameService.js";
import { IapService } from "../src/services/iapService.js";
import { FakeClock } from "../src/services/clock.js";

function queueRng() {
  const ints: number[] = [];
  const rng: Rng = {
    intBetween: (min, max) => {
      const v = ints.length ? (ints.shift() as number) : min;
      return Math.min(max - 1, Math.max(min, v));
    },
    random: () => 0,
  };
  return { rng, ints };
}

describe("analytics events (§14.2)", () => {
  let analytics: MemoryAnalytics;
  let game: GameService;
  let auth: AuthService;
  let iap: IapService;
  let validator: StubReceiptValidator;
  let q: ReturnType<typeof queueRng>;

  beforeEach(() => {
    const repo = new MemoryPlayerRepository();
    analytics = new MemoryAnalytics();
    const clock = new FakeClock(1_000);
    q = queueRng();
    game = new GameService({ repo, ledger: new MemoryLedger(), liveOps: new MemoryLiveOpsStore(defaultLiveOps), rng: q.rng, clock, analytics });
    auth = new AuthService({ authRepo: new MemoryAuthRepository(), tokens: new TokenService("secret-0123456789abcd"), createPlayer: (n) => game.createPlayer(n), clock, analytics });
    validator = new StubReceiptValidator("rs");
    iap = new IapService({ catalog: new Catalog(), validator, purchases: new MemoryPurchaseRepository(), game, clock, analytics });
  });

  it("emits REGISTER on signup", async () => {
    const { player } = await auth.register("Hana", "device-aaaaaaaa");
    const events = analytics.ofType("REGISTER");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ playerId: player.id, name: "Hana" });
  });

  it("emits SPIN with outcome and coins", async () => {
    const p = await game.createPlayer("Yuki");
    const { outcome } = await game.spin(p.id, 2); // default rng → 3× coin JACKPOT
    const ev = analytics.ofType("SPIN").at(-1)!;
    expect(ev).toMatchObject({ playerId: p.id, bet: 2, outcome: "JACKPOT", coins: outcome.coins });
  });

  it("emits BUILD with cost and level", async () => {
    const p = await game.createPlayer("Yuki");
    await game.spin(p.id, 1); // jackpot → coins to spend
    await game.build(p.id, 0);
    const ev = analytics.ofType("BUILD").at(-1)!;
    expect(ev).toMatchObject({ playerId: p.id, buildingIndex: 0, newLevel: 1 });
    expect(ev.cost).toBeGreaterThan(0);
  });

  it("emits SUMMON with rarity", async () => {
    const p = await game.createPlayer("Yuki");
    q.ints.push(95, 95, 95); // 3× spirit → spirit tokens
    await game.spin(p.id, 1);
    const pull = await game.summon(p.id);
    const ev = analytics.ofType("SUMMON").at(-1)!;
    expect(ev).toMatchObject({ playerId: p.id, rarity: pull.rarity, viaPity: pull.viaPity });
  });

  it("emits PURCHASE on a fulfilled redemption", async () => {
    const p = await game.createPlayer("Mei");
    await iap.redeem(p.id, "ios", "spin_s", validator.sign("tx-analytics-1", "spin_s"));
    const ev = analytics.ofType("PURCHASE").at(-1)!;
    expect(ev).toMatchObject({ playerId: p.id, productId: "spin_s", transactionId: "tx-analytics-1", granted: true });
  });

  it("does not emit PURCHASE again for a duplicate transaction", async () => {
    const p = await game.createPlayer("Mei");
    const receipt = validator.sign("tx-dup-1", "gem_s");
    await iap.redeem(p.id, "ios", "gem_s", receipt);
    await iap.redeem(p.id, "ios", "gem_s", receipt);
    expect(analytics.ofType("PURCHASE")).toHaveLength(1); // idempotent → one event
  });
});
