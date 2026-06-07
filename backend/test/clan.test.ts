import { beforeEach, describe, expect, it } from "vitest";
import { defaultLiveOps } from "../src/config/liveops.js";
import { MemoryClanRepository } from "../src/data/clanRepository.js";
import { MemoryLedger } from "../src/data/ledger.js";
import { MemoryPlayerRepository } from "../src/data/memoryRepository.js";
import { CLAN_MAX_MEMBERS } from "../src/domain/clanTypes.js";
import type { Rng } from "../src/domain/rng.js";
import { ClanService } from "../src/services/clanService.js";
import { GameService } from "../src/services/gameService.js";
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

describe("ClanService", () => {
  let repo: MemoryPlayerRepository;
  let clanRepo: MemoryClanRepository;
  let clock: FakeClock;
  let clan: ClanService;
  let q: ReturnType<typeof queueRng>;
  let game: GameService;

  beforeEach(() => {
    repo = new MemoryPlayerRepository();
    clanRepo = new MemoryClanRepository();
    clock = new FakeClock(1_000_000);
    q = queueRng();
    clan = new ClanService({ clanRepo, playerRepo: repo, clock });
    game = new GameService({
      repo,
      ledger: new MemoryLedger(),
      config: defaultLiveOps,
      rng: q.rng,
      clock,
      onContribution: (pid, pts) => clan.contribute(pid, pts),
    });
  });

  it("creates a clan with the founder as leader and sole member", async () => {
    const p = await game.createPlayer("Leader");
    const c = await clan.createClan(p.id, "Sky Foxes", "FOX");
    expect(c.leaderId).toBe(p.id);
    expect(c.memberIds).toEqual([p.id]);
    expect((await game.getPlayer(p.id)).clanId).toBe(c.id);
  });

  it("blocks creating/joining when already in a clan", async () => {
    const p = await game.createPlayer("Leader");
    const c = await clan.createClan(p.id, "Sky Foxes", "FOX");
    await expect(clan.createClan(p.id, "Other", "OTH")).rejects.toThrow(/current clan/i);
    await expect(clan.joinClan(p.id, c.id)).rejects.toThrow(/current clan/i);
  });

  it("lets others join up to the member cap", async () => {
    const leader = await game.createPlayer("Leader");
    const c = await clan.createClan(leader.id, "Sky Foxes", "FOX");
    for (let i = 1; i < CLAN_MAX_MEMBERS; i++) {
      const m = await game.createPlayer(`M${i}`);
      await clan.joinClan(m.id, c.id);
    }
    expect((await clan.getClan(c.id)).memberIds).toHaveLength(CLAN_MAX_MEMBERS);

    const overflow = await game.createPlayer("Overflow");
    await expect(clan.joinClan(overflow.id, c.id)).rejects.toThrow(/full/i);
  });

  it("promotes a new leader on leave and disbands when empty", async () => {
    const leader = await game.createPlayer("Leader");
    const member = await game.createPlayer("Member");
    const c = await clan.createClan(leader.id, "Sky Foxes", "FOX");
    await clan.joinClan(member.id, c.id);

    await clan.leaveClan(leader.id);
    const after = await clan.getClan(c.id);
    expect(after.leaderId).toBe(member.id);
    expect(after.memberIds).toEqual([member.id]);

    await clan.leaveClan(member.id);
    await expect(clan.getClan(c.id)).rejects.toThrow(/not found/i);
  });

  it("declares war and accrues points from raid wins", async () => {
    // Two clans with members; raider's clan declares war on the other.
    const raider = await game.createPlayer("Raider");
    const victim = await game.createPlayer("Victim");
    const enemyLeader = await game.createPlayer("Enemy");

    const myClan = await clan.createClan(raider.id, "Foxes", "FOX");
    await clan.createClan(enemyLeader.id, "Wolves", "WLF");

    const war = await clan.declareWar(raider.id);
    expect(war.opponentClanId).toBeTruthy();
    expect(war.myScore).toBe(0);

    // Fund the victim, then force a raid for the raider and dig coins.
    for (let i = 0; i < 10; i++) await game.spin(victim.id, 1);
    q.ints.push(85, 85, 85, 9_999, 9_999, 9_999, 9_999); // 3× raid + spot values
    const spin = await game.spin(raider.id, 1);
    expect(spin.outcome.type).toBe("RAID");
    const result = await game.raidDig(raider.id, [0, 1, 2]);
    expect(result.reward).toBeGreaterThan(0);

    const status = await clan.warStatus(raider.id);
    expect(status?.myScore).toBeGreaterThan(0);
    void myClan;
  });

  it("only the leader can declare war", async () => {
    const leader = await game.createPlayer("Leader");
    const member = await game.createPlayer("Member");
    const c = await clan.createClan(leader.id, "Foxes", "FOX");
    await clan.joinClan(member.id, c.id);
    const enemy = await game.createPlayer("Enemy");
    await clan.createClan(enemy.id, "Wolves", "WLF");

    await expect(clan.declareWar(member.id)).rejects.toThrow(/leader/i);
  });
});
