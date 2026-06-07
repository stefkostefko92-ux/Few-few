import { beforeEach, describe, expect, it } from "vitest";
import { defaultLiveOps } from "../src/config/liveops.js";
import { MemoryLedger, playerAccount } from "../src/data/ledger.js";
import { MemoryPlayerRepository } from "../src/data/memoryRepository.js";
import type { Currency } from "../src/domain/types.js";
import type { Rng } from "../src/domain/rng.js";
import { GameService } from "../src/services/gameService.js";
import { FakeClock } from "../src/services/clock.js";

/**
 * Queue-driven Rng for deterministic outcomes.
 *  - intBetween: shifts from `ints`, else returns min (→ pickByWeight selects
 *    the first reel symbol "coin", i.e. every spin is a 3× coin jackpot).
 *  - random: shifts from `floats`, else returns 0.
 */
function queueRng() {
  const ints: number[] = [];
  const floats: number[] = [];
  const rng: Rng = {
    intBetween(min, max) {
      const v = ints.length ? (ints.shift() as number) : min;
      return Math.min(max - 1, Math.max(min, v));
    },
    random() {
      return floats.length ? (floats.shift() as number) : 0;
    },
  };
  return { rng, ints, floats };
}

const CURRENCIES: Currency[] = ["spins", "coins", "spiritTokens", "gems"];

async function assertBooksBalanced(ledger: MemoryLedger, repo: MemoryPlayerRepository, ids: string[]) {
  for (const c of CURRENCIES) {
    // Global conservation: nothing minted or destroyed off-book.
    expect(await ledger.netForCurrency(c)).toBe(0);
  }
  for (const id of ids) {
    const p = await repo.getOrThrow(id);
    expect(await ledger.balanceOf(playerAccount(id), "spins")).toBe(p.spins);
    expect(await ledger.balanceOf(playerAccount(id), "coins")).toBe(p.coins);
    expect(await ledger.balanceOf(playerAccount(id), "spiritTokens")).toBe(p.spiritTokens);
    expect(await ledger.balanceOf(playerAccount(id), "gems")).toBe(p.gems);
  }
}

describe("GameService loop", () => {
  let repo: MemoryPlayerRepository;
  let ledger: MemoryLedger;
  let clock: FakeClock;
  let q: ReturnType<typeof queueRng>;
  let game: GameService;

  beforeEach(() => {
    repo = new MemoryPlayerRepository();
    ledger = new MemoryLedger();
    clock = new FakeClock(1_000_000);
    q = queueRng();
    game = new GameService({ repo, ledger, config: defaultLiveOps, rng: q.rng, clock });
  });

  it("grants the starting bonus through the ledger", async () => {
    const p = await game.createPlayer("Hana");
    expect(p.spins).toBe(defaultLiveOps.spins.startingBonus);
    await assertBooksBalanced(ledger, repo, [p.id]);
  });

  it("spends spins and mints coins on a jackpot spin, books balanced", async () => {
    const p = await game.createPlayer("Hana");
    const before = p.spins;
    const { outcome } = await game.spin(p.id, 1);
    expect(outcome.type).toBe("JACKPOT"); // default rng → 3× coin
    const after = await game.getPlayer(p.id);
    expect(after.spins).toBe(before - 1);
    expect(after.coins).toBe(outcome.coins);
    await assertBooksBalanced(ledger, repo, [p.id]);
  });

  it("completes an island via build and unlocks the next one", async () => {
    const p = await game.createPlayer("Hana");
    // Amass coins with jackpot spins (each 3× coin).
    for (let i = 0; i < 70; i++) await game.spin(p.id, 1);

    // Build every building to max until the island completes.
    const cfg = defaultLiveOps.islands;
    let safety = 0;
    while ((await game.getPlayer(p.id)).currentIsland === 0 && safety++ < 1000) {
      const player = await game.getPlayer(p.id);
      const island = player.islands[0];
      const idx = island.buildings.findIndex((b) => b.level < cfg.levelsPerBuilding);
      if (idx === -1) break;
      await game.build(p.id, idx);
    }

    const after = await game.getPlayer(p.id);
    expect(after.currentIsland).toBe(1);
    expect(after.islands[0].completed).toBe(true);
    expect(after.islands).toHaveLength(2);
    await assertBooksBalanced(ledger, repo, [p.id]);
  });

  it("attack steals coins from an unshielded target and grants revenge", async () => {
    const attacker = await game.createPlayer("Attacker");
    const target = await game.createPlayer("Target");

    // Fund the target and raise a building to level 1 (something to break).
    for (let i = 0; i < 5; i++) await game.spin(target.id, 1);
    await game.build(target.id, 0);
    const targetCoinsBefore = (await game.getPlayer(target.id)).coins;
    expect(targetCoinsBefore).toBeGreaterThan(0);

    // Force a 3× Strike spin for the attacker (reel roll 70 → "strike").
    q.ints.push(70, 70, 70);
    const { outcome } = await game.spin(attacker.id, 1);
    expect(outcome.type).toBe("ATTACK");

    const result = await game.attack(attacker.id, target.id, 0);
    expect(result.blocked).toBe(false);
    expect(result.reward).toBeGreaterThan(0);

    const targetAfter = await game.getPlayer(target.id);
    const attackerAfter = await game.getPlayer(attacker.id);
    expect(targetAfter.coins).toBe(targetCoinsBefore - result.reward);
    expect(targetAfter.islands[0].buildings[0].level).toBe(0); // knocked down a level
    expect(targetAfter.revengeTargets.some((r) => r.attackerId === attacker.id)).toBe(true);
    expect(attackerAfter.pendingAttack).toBeNull(); // single-use grant consumed

    await assertBooksBalanced(ledger, repo, [attacker.id, target.id]);
  });

  it("a shielded target blocks the attack with no coin loss", async () => {
    const attacker = await game.createPlayer("Attacker");
    const target = await game.createPlayer("Target");
    for (let i = 0; i < 5; i++) await game.spin(target.id, 1);

    // Give the target shields via a 3× Ward spin (reel roll 50 → "ward").
    q.ints.push(50, 50, 50);
    await game.spin(target.id, 1);
    expect((await game.getPlayer(target.id)).shields).toBeGreaterThan(0);
    const coinsBefore = (await game.getPlayer(target.id)).coins;

    q.ints.push(70, 70, 70); // attacker rolls strike
    await game.spin(attacker.id, 1);
    const result = await game.attack(attacker.id, target.id, 0);

    expect(result.blocked).toBe(true);
    expect(result.reward).toBe(0);
    expect((await game.getPlayer(target.id)).coins).toBe(coinsBefore);
    await assertBooksBalanced(ledger, repo, [attacker.id, target.id]);
  });

  it("raid grant is single-use and never over-drains the victim", async () => {
    const raider = await game.createPlayer("Raider");
    const victim = await game.createPlayer("Victim");
    for (let i = 0; i < 10; i++) await game.spin(victim.id, 1);

    // Force a 3× Raid spin (reel roll 85 → "raid"); prepareRaid then draws spot
    // values — push generous amounts so some coins sit behind the holes.
    q.ints.push(85, 85, 85, 9_999, 9_999, 9_999, 9_999);
    const { outcome } = await game.spin(raider.id, 1);
    expect(outcome.type).toBe("RAID");

    const result = await game.raidDig(raider.id, [0, 1, 2]);
    expect(result.reward).toBeGreaterThanOrEqual(0);
    expect((await game.getPlayer(raider.id)).pendingRaid).toBeNull();

    // Cannot dig again on a consumed grant.
    await expect(game.raidDig(raider.id, [0, 1, 2])).rejects.toThrow();
    await assertBooksBalanced(ledger, repo, [raider.id, victim.id]);
  });

  it("summon burns spirit tokens and yields a companion, books balanced", async () => {
    const p = await game.createPlayer("Hana");
    // Earn spirit tokens via a 3× Spirit spin (reel roll 95 → "spirit").
    q.ints.push(95, 95, 95);
    await game.spin(p.id, 1);
    expect((await game.getPlayer(p.id)).spiritTokens).toBeGreaterThanOrEqual(
      defaultLiveOps.gacha.costSpiritTokens,
    );

    const pull = await game.summon(p.id);
    expect(["common", "rare", "epic", "mythic"]).toContain(pull.rarity);
    expect((await game.getPlayer(p.id)).companions).toHaveLength(1);
    await assertBooksBalanced(ledger, repo, [p.id]);
  });

  it("rejects a spin when the player is out of spins", async () => {
    const p = await game.createPlayer("Hana");
    // Drain spins.
    let guard = 0;
    while ((await game.getPlayer(p.id)).spins > 0 && guard++ < 200) await game.spin(p.id, 1);
    await expect(game.spin(p.id, 1)).rejects.toThrowError(/not enough spins/);
  });
});
