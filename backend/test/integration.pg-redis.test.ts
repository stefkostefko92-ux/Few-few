import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { defaultLiveOps } from "../src/config/liveops.js";
import { PrismaLedger } from "../src/data/prismaLedger.js";
import { PrismaPlayerRepository } from "../src/data/prismaRepository.js";
import { PrismaClanRepository } from "../src/data/prismaClanRepository.js";
import { PrismaLiveOpsStore } from "../src/data/prismaLiveOpsStore.js";
import { PrismaStore } from "../src/data/prismaStore.js";
import { createPrismaClient } from "../src/data/prismaClient.js";
import { playerAccount } from "../src/data/ledger.js";
import type { Currency } from "../src/domain/types.js";
import type { Rng } from "../src/domain/rng.js";
import { Catalog } from "../src/monetization/catalog.js";
import { ClanService } from "../src/services/clanService.js";
import { GameService } from "../src/services/gameService.js";
import { IapService } from "../src/services/iapService.js";
import { RedisLeaderboard } from "../src/services/leaderboard.js";
import { FakeClock } from "../src/services/clock.js";

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

/**
 * Integration test against REAL Postgres + Redis. Skipped unless DATABASE_URL is
 * set (so `npm test` stays infra-free). Run with both services up:
 *   DATABASE_URL=... REDIS_URL=... npx vitest run integration
 */
describe.skipIf(!DATABASE_URL)("Postgres + Redis integration", () => {
  const prisma = createPrismaClient(DATABASE_URL!);
  const repo = new PrismaPlayerRepository(prisma);
  const ledger = new PrismaLedger(prisma);
  const redis = REDIS_URL ? new Redis(REDIS_URL) : null;
  const leaderboard = redis ? new RedisLeaderboard(redis) : undefined;

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

  const store = new PrismaStore(prisma); // real interactive $transaction (atomic UoW)
  let game: GameService;
  let q: ReturnType<typeof queueRng>;

  beforeEach(async () => {
    await prisma.clanWar.deleteMany();
    await prisma.clan.deleteMany();
    await prisma.purchase.deleteMany();
    await prisma.ledgerLeg.deleteMany();
    await prisma.player.deleteMany();
    if (redis) await redis.del("lb:global:coins", "lb:names");
    q = queueRng();
    game = new GameService({
      store,
      config: defaultLiveOps,
      rng: q.rng,
      clock: new FakeClock(1_000_000),
      ...(leaderboard ? { leaderboard } : {}),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (redis) redis.disconnect();
  });

  const CURRENCIES: Currency[] = ["spins", "coins", "spiritTokens", "gems"];

  async function assertBooks(ids: string[]) {
    for (const c of CURRENCIES) expect(await ledger.netForCurrency(c)).toBe(0);
    for (const id of ids) {
      const p = await repo.getOrThrow(id);
      expect(await ledger.balanceOf(playerAccount(id), "spins")).toBe(p.spins);
      expect(await ledger.balanceOf(playerAccount(id), "coins")).toBe(p.coins);
      expect(await ledger.balanceOf(playerAccount(id), "spiritTokens")).toBe(p.spiritTokens);
    }
  }

  it("persists a player and reads it back through Postgres", async () => {
    const p = await game.createPlayer("Hana");
    const reloaded = await repo.getOrThrow(p.id);
    expect(reloaded.spins).toBe(defaultLiveOps.spins.startingBonus);
    expect(reloaded.islands).toHaveLength(1);
    expect(reloaded.islands[0].buildings).toHaveLength(defaultLiveOps.islands.buildingsPerIsland);
    await assertBooks([p.id]);
  });

  it("runs the full loop with SQL-aggregated ledger conservation", async () => {
    const a = await game.createPlayer("Attacker");
    const b = await game.createPlayer("Target");

    // Fund both with jackpot spins (default rng → 3× coin).
    for (let i = 0; i < 8; i++) await game.spin(a.id, 1);
    for (let i = 0; i < 8; i++) await game.spin(b.id, 1);
    await game.build(b.id, 0);

    // Attacker rolls a strike and raids coins from the target.
    q.ints.push(70, 70, 70);
    const spin = await game.spin(a.id, 1);
    expect(spin.outcome.type).toBe("ATTACK");
    const atk = await game.attack(a.id, b.id, 0);
    expect(atk.reward).toBeGreaterThan(0);

    // Books still balance, computed by Postgres SUM aggregation.
    await assertBooks([a.id, b.id]);

    // Persistence really happened: reload from DB and confirm coins match.
    const aDb = await repo.getOrThrow(a.id);
    expect(aDb.coins).toBe(await ledger.balanceOf(playerAccount(a.id), "coins"));
  });

  it("IAP idempotency is enforced by the Postgres unique constraint", async () => {
    const p = await game.createPlayer("Buyer");
    const before = (await repo.getOrThrow(p.id)).spins;
    const iap = new IapService({
      catalog: new Catalog(),
      validator: { async validate(_pl, productId, receipt) {
        return { valid: true, transactionId: receipt, productId };
      } },
      game,
    });

    const first = await iap.redeem(p.id, "ios", "spin_m", "pg-tx-1");
    const second = await iap.redeem(p.id, "ios", "spin_m", "pg-tx-1");
    expect(first.granted).toBe(true);
    expect(second.granted).toBe(false);
    expect((await repo.getOrThrow(p.id)).spins).toBe(before + 180); // granted once
    await assertBooks([p.id]);
  });

  it("grants an IAP exactly once under concurrent duplicate redemptions", async () => {
    const p = await game.createPlayer("Buyer");
    const before = (await repo.getOrThrow(p.id)).spins;
    const iap = new IapService({
      catalog: new Catalog(),
      validator: { async validate(_pl, productId, receipt) {
        return { valid: true, transactionId: receipt, productId };
      } },
      game,
    });

    // Five concurrent deliveries of the same transactionId (client retry storm
    // + webhook). The record+grant transaction + unique constraint must let
    // exactly one through.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => iap.redeem(p.id, "ios", "spin_m", "pg-tx-race").catch(() => ({ granted: false }))),
    );
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    expect((await repo.getOrThrow(p.id)).spins).toBe(before + 180); // not 5×180
    await assertBooks([p.id]);
  });

  it("serializes concurrent clan joins so no member is lost and the cap holds", async () => {
    const clan = new ClanService({ clanRepo: new PrismaClanRepository(prisma), playerRepo: repo, store, clock: new FakeClock(1_000_000) });
    const leader = await game.createPlayer("Leader");
    const created = await clan.createClan(leader.id, "Sky Foxes", "FOX");

    const joiners = await Promise.all(Array.from({ length: 8 }, (_, i) => game.createPlayer(`J${i}`)));
    await Promise.all(joiners.map((j) => clan.joinClan(j.id, created.id)));

    const reloaded = await clan.getClan(created.id);
    expect(reloaded.memberIds).toHaveLength(9); // leader + 8, none lost to a race
    for (const j of joiners) expect(reloaded.memberIds).toContain(j.id);
  });

  it("does not lose concurrent war-score contributions", async () => {
    const clanRepo = new PrismaClanRepository(prisma);
    const clan = new ClanService({ clanRepo, playerRepo: repo, store, clock: new FakeClock(1_000_000) });
    const a = await game.createPlayer("LeaderA");
    const b = await game.createPlayer("LeaderB");
    await clan.createClan(a.id, "Alpha", "ALP");
    await clan.createClan(b.id, "Beta", "BET"); // an opponent must exist
    const war = await clan.declareWar(a.id);

    // 20 concurrent +1 contributions from clan A's leader.
    await Promise.all(Array.from({ length: 20 }, () => clan.contribute(a.id, 1)));

    const status = await clan.warStatus(a.id);
    expect(status?.warId).toBe(war.warId);
    expect(status?.myScore).toBe(20); // atomic increments — nothing lost
  });

  it("rolls back the player update AND ledger legs together when a txn throws (§11.3)", async () => {
    const player = await game.createPlayer("Tx"); // committed via the default store
    const store = new PrismaStore(prisma);

    await expect(
      store.transaction(async (tx) => {
        await tx.ledger.mint(player.id, "coins", 9999, "SHOULD_ROLLBACK");
        const p = await tx.players.getOrThrow(player.id);
        p.coins += 9999;
        await tx.players.save(p);
        throw new Error("boom"); // abort after writing both
      }),
    ).rejects.toThrow("boom");

    // Neither the ledger leg nor the player mutation survived the rollback.
    expect(await ledger.balanceOf(playerAccount(player.id), "coins")).toBe(0);
    expect((await repo.getOrThrow(player.id)).coins).toBe(0);
    await assertBooks([player.id]);
  });

  it("commits a real spin atomically over PrismaStore", async () => {
    const store = new PrismaStore(prisma);
    const txGame = new GameService({
      store,
      liveOps: new (await import("../src/config/liveOpsStore.js")).MemoryLiveOpsStore(defaultLiveOps),
      rng: q.rng,
      clock: new FakeClock(1_000_000),
    });
    const p = await txGame.createPlayer("Spinner");
    const before = (await repo.getOrThrow(p.id)).spins;
    const { outcome } = await txGame.spin(p.id, 1); // default rng → 3× coin jackpot

    const reloaded = await repo.getOrThrow(p.id);
    expect(reloaded.spins).toBe(before - 1);
    expect(reloaded.coins).toBe(outcome.coins);
    // Player balances equal the SQL-aggregated ledger → committed consistently.
    expect(await ledger.balanceOf(playerAccount(p.id), "coins")).toBe(reloaded.coins);
    expect(await ledger.balanceOf(playerAccount(p.id), "spins")).toBe(reloaded.spins);
    expect(await ledger.netForCurrency("coins")).toBe(0);
  });

  it("persists a LiveOps config update across store instances (§6.2)", async () => {
    await prisma.liveOpsConfig.deleteMany();
    const store = new PrismaLiveOpsStore(prisma, defaultLiveOps);
    await store.load(); // empty → keeps fallback default
    expect(store.get().payouts.jackpotMultiplier).toBe(defaultLiveOps.payouts.jackpotMultiplier);

    await store.replace({ ...defaultLiveOps, payouts: { ...defaultLiveOps.payouts, jackpotMultiplier: 77 } });

    // A fresh store (e.g. after a restart) loads the persisted value from PG.
    const reloaded = new PrismaLiveOpsStore(prisma, defaultLiveOps);
    await reloaded.load();
    expect(reloaded.get().payouts.jackpotMultiplier).toBe(77);
  });

  it.skipIf(!REDIS_URL)("appends analytics events to a Redis stream (§14.2)", async () => {
    const { RedisStreamAnalytics } = await import("../src/analytics/redisAnalytics.js");
    const stream = "analytics:test";
    await redis!.del(stream);
    const sink = new RedisStreamAnalytics(redis!, stream);
    await sink.record({ type: "SPIN", playerId: "p1", at: 1, bet: 1, outcome: "JACKPOT", coins: 3000 });
    await sink.record({ type: "PURCHASE", playerId: "p1", at: 2, productId: "spin_s", transactionId: "t1", granted: true });

    const rows = await redis!.xrange(stream, "-", "+");
    expect(rows).toHaveLength(2);
    // Each row: [id, [field, value, ...]]; reconstruct the JSON payload.
    const decoded = rows.map(([, fields]) => {
      const i = fields.indexOf("data");
      return JSON.parse(fields[i + 1]);
    });
    expect(decoded[0]).toMatchObject({ type: "SPIN", outcome: "JACKPOT" });
    expect(decoded[1]).toMatchObject({ type: "PURCHASE", productId: "spin_s" });
    await redis!.del(stream);
  });

  it.skipIf(!REDIS_URL)("drains the analytics stream via a consumer group (§14.2)", async () => {
    const { RedisStreamAnalytics } = await import("../src/analytics/redisAnalytics.js");
    const { AnalyticsConsumer } = await import("../src/analytics/consumer.js");
    const { MemoryWarehouseWriter } = await import("../src/analytics/warehouse.js");

    const stream = "analytics:consumer-test";
    await redis!.del(stream);
    const sink = new RedisStreamAnalytics(redis!, stream);
    const writer = new MemoryWarehouseWriter();
    const consumer = new AnalyticsConsumer(redis!, writer, { stream, group: "g", consumer: "c1" });
    await consumer.ensureGroup();

    await sink.record({ type: "REGISTER", playerId: "p1", at: 1, name: "Aoi" });
    await sink.record({ type: "SPIN", playerId: "p1", at: 2, bet: 1, outcome: "JACKPOT", coins: 3000 });
    await sink.record({ type: "PURCHASE", playerId: "p1", at: 3, productId: "spin_s", transactionId: "t1", granted: true });

    const processed = await consumer.drainOnce();
    expect(processed).toBe(3);
    expect(writer.rows.map((r) => r.type)).toEqual(["REGISTER", "SPIN", "PURCHASE"]);

    // All acked → a second drain sees nothing new.
    expect(await consumer.drainOnce()).toBe(0);
    await redis!.del(stream);
  });

  it.skipIf(!REDIS_URL)("ranks players on the Redis leaderboard", async () => {
    const rich = await game.createPlayer("Rich");
    const poor = await game.createPlayer("Poor");
    for (let i = 0; i < 5; i++) await game.spin(rich.id, 1); // jackpots → lots of coins
    await game.spin(poor.id, 1);

    const top = await game.leaderboardTop(10);
    expect(top[0]?.playerId).toBe(rich.id);
    expect(top[0]?.score).toBeGreaterThan(top[1]?.score ?? 0);
    expect(await game.leaderboardRank(rich.id)).toBe(1);
    expect(await game.leaderboardRank(poor.id)).toBe(2);
  });
});
