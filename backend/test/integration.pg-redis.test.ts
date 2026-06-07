import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { defaultLiveOps } from "../src/config/liveops.js";
import { PrismaLedger } from "../src/data/prismaLedger.js";
import { PrismaPlayerRepository } from "../src/data/prismaRepository.js";
import { PrismaPurchaseRepository } from "../src/data/prismaPurchaseRepository.js";
import { createPrismaClient } from "../src/data/prismaClient.js";
import { playerAccount } from "../src/data/ledger.js";
import type { Currency } from "../src/domain/types.js";
import type { Rng } from "../src/domain/rng.js";
import { Catalog } from "../src/monetization/catalog.js";
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

  let game: GameService;
  let q: ReturnType<typeof queueRng>;

  beforeEach(async () => {
    await prisma.purchase.deleteMany();
    await prisma.ledgerLeg.deleteMany();
    await prisma.player.deleteMany();
    if (redis) await redis.del("lb:global:coins", "lb:names");
    q = queueRng();
    game = new GameService({
      repo,
      ledger,
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
      purchases: new PrismaPurchaseRepository(prisma),
      game,
    });

    const first = await iap.redeem(p.id, "ios", "spin_m", "pg-tx-1");
    const second = await iap.redeem(p.id, "ios", "spin_m", "pg-tx-1");
    expect(first.granted).toBe(true);
    expect(second.granted).toBe(false);
    expect((await repo.getOrThrow(p.id)).spins).toBe(before + 180); // granted once
    await assertBooks([p.id]);
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
