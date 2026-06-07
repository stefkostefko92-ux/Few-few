import { randomUUID } from "node:crypto";
import type { LiveOpsConfig } from "../config/liveops.js";
import { Ledger } from "../data/ledger.js";
import type { PlayerRepository } from "../data/repository.js";
import { clampInc, regenSpins } from "../domain/economy.js";
import { pull as gachaPull } from "../domain/gacha.js";
import { buildingCost, islandIsComplete, makeIsland, villageMultiplier } from "../domain/islands.js";
import { cryptoRng, type Rng } from "../domain/rng.js";
import { drawReel, resolveSpin } from "../domain/spin.js";
import type { Companion, Player, SpinOutcome } from "../domain/types.js";
import { GameError, InsufficientFunds, InvalidAction } from "../errors.js";
import { systemClock, type Clock } from "./clock.js";

const ACTION_GRANT_TTL_MS = 5 * 60_000; // a rolled attack/raid must be used within 5 min
const REVENGE_TTL_MS = 24 * 3_600_000;

export interface GameServiceDeps {
  repo: PlayerRepository;
  ledger: Ledger;
  config: LiveOpsConfig;
  rng?: Rng;
  clock?: Clock;
}

export interface BuildResult {
  player: Player;
  buildingIndex: number;
  newLevel: number;
  cost: number;
  islandCompleted: boolean;
  unlockedIsland: number | null;
}

export interface AttackResult {
  player: Player;
  targetId: string;
  buildingIndex: number;
  blocked: boolean;
  reward: number;
  targetBuildingLevel: number;
}

export interface RaidResult {
  player: Player;
  targetId: string;
  picks: number[];
  reward: number;
}

export interface PullOutcome {
  rarity: Companion["rarity"];
  viaPity: boolean;
  companion: Companion;
}

/**
 * Application layer. Every value-bearing action is resolved here, server-side,
 * and recorded in the double-entry ledger in the same logical step — the client
 * only ever animates the returned result (GDD §5.1, §11.3).
 */
export class GameService {
  private readonly repo: PlayerRepository;
  private readonly ledger: Ledger;
  private readonly config: LiveOpsConfig;
  private readonly rng: Rng;
  private readonly clock: Clock;

  constructor(deps: GameServiceDeps) {
    this.repo = deps.repo;
    this.ledger = deps.ledger;
    this.config = deps.config;
    this.rng = deps.rng ?? cryptoRng;
    this.clock = deps.clock ?? systemClock;
  }

  // ---- Player lifecycle -------------------------------------------------

  createPlayer(name: string): Player {
    const now = this.clock.now();
    const id = randomUUID();
    const player: Player = {
      id,
      name,
      createdAt: now,
      spins: 0,
      coins: 0,
      spiritTokens: 0,
      gems: 0,
      spinsUpdatedAt: now,
      shields: 0,
      currentIsland: 0,
      islands: [makeIsland(this.config, 0)],
      pullsSinceEpic: 0,
      pullsSinceMythic: 0,
      companions: [],
      revengeTargets: [],
      pendingAttack: null,
      pendingRaid: null,
    };
    this.repo.create(player);
    // Starting bonus minted through the ledger so the books balance from t0.
    this.ledger.mint(id, "spins", this.config.spins.startingBonus, "STARTING_BONUS", now);
    player.spins = this.config.spins.startingBonus;
    this.repo.save(player);
    return player;
  }

  /** Reconciles spin regen lazily on read and persists the result. */
  getPlayer(id: string): Player {
    const player = this.repo.getOrThrow(id);
    const now = this.clock.now();
    const { spins, spinsUpdatedAt } = regenSpins(
      player.spins,
      player.spinsUpdatedAt,
      now,
      this.config.spins.regenPerHour,
      this.config.spins.cap,
    );
    if (spins !== player.spins || spinsUpdatedAt !== player.spinsUpdatedAt) {
      const gained = spins - player.spins;
      if (gained > 0) this.ledger.mint(player.id, "spins", gained, "SPIN_REGEN", now);
      player.spins = spins;
      player.spinsUpdatedAt = spinsUpdatedAt;
      this.repo.save(player);
    }
    return player;
  }

  // ---- Core loop: spin --------------------------------------------------

  spin(playerId: string, betMultiplier: number): { outcome: SpinOutcome; player: Player } {
    const player = this.getPlayer(playerId);
    const now = this.clock.now();

    const bet = Math.trunc(betMultiplier);
    if (!Number.isFinite(bet) || bet < 1) throw new InvalidAction("bet must be >= 1");
    if (bet > this.config.spins.maxBet) {
      throw new InvalidAction(`bet exceeds maxBet (${this.config.spins.maxBet})`);
    }
    if (player.spins < bet) throw new InsufficientFunds("spins", player.spins, bet);

    const reels: SpinOutcome["reels"] = [
      drawReel(this.config, this.rng),
      drawReel(this.config, this.rng),
      drawReel(this.config, this.rng),
    ];
    const mult = villageMultiplier(this.config, player.currentIsland);
    const outcome = resolveSpin(reels, bet, mult, this.config);

    // Spend the bet, then apply rewards — all through the ledger.
    this.ledger.burn(player.id, "spins", bet, "SPIN", now);
    player.spins -= bet;

    if (outcome.coins > 0) {
      this.ledger.mint(player.id, "coins", outcome.coins, "SPIN_COINS", now);
      player.coins += outcome.coins;
    }
    if (outcome.spiritTokens > 0) {
      this.ledger.mint(player.id, "spiritTokens", outcome.spiritTokens, "SPIN_SPIRIT", now);
      player.spiritTokens += outcome.spiritTokens;
    }
    if (outcome.shields > 0) {
      // Shields are a capped, non-tradable defensive resource — tracked on the
      // player, not in the currency ledger.
      player.shields = clampInc(player.shields, outcome.shields, this.config.payouts.shieldCap);
    }

    if (outcome.action === "ATTACK") {
      player.pendingAttack = { bet, grantedAt: now, expiresAt: now + ACTION_GRANT_TTL_MS };
    }
    if (outcome.action === "RAID") {
      player.pendingRaid = this.prepareRaid(player, now);
    }

    this.repo.save(player);
    return { outcome, player };
  }

  // ---- Build loop -------------------------------------------------------

  build(playerId: string, buildingIndex: number): BuildResult {
    const player = this.getPlayer(playerId);
    const now = this.clock.now();
    const island = player.islands[player.currentIsland];
    if (!island) throw new InvalidAction("current island not found");
    const building = island.buildings[buildingIndex];
    if (!building) throw new InvalidAction(`invalid building index ${buildingIndex}`);
    if (building.level >= this.config.islands.levelsPerBuilding) {
      throw new InvalidAction("building already at max level");
    }

    const cost = buildingCost(this.config, island.index, buildingIndex, building.level);
    if (player.coins < cost) throw new InsufficientFunds("coins", player.coins, cost);

    this.ledger.burn(player.id, "coins", cost, "BUILD", now);
    player.coins -= cost;
    building.level += 1;

    let unlockedIsland: number | null = null;
    if (!island.completed && islandIsComplete(this.config, island)) {
      island.completed = true;
      const nextIndex = island.index + 1;
      player.islands.push(makeIsland(this.config, nextIndex));
      player.currentIsland = nextIndex;
      unlockedIsland = nextIndex;
    }

    this.repo.save(player);
    return {
      player,
      buildingIndex,
      newLevel: building.level,
      cost,
      islandCompleted: island.completed,
      unlockedIsland,
    };
  }

  // ---- Attack -----------------------------------------------------------

  /** Matchmaking candidate pool for the player's open attack/raid grant (§11.2). */
  attackCandidates(playerId: string, limit = 5): { id: string; name: string; island: number }[] {
    const player = this.getPlayer(playerId);
    return this.matchmake(player, limit).map((p) => ({ id: p.id, name: p.name, island: p.currentIsland }));
  }

  attack(playerId: string, targetId: string, buildingIndex: number): AttackResult {
    const player = this.getPlayer(playerId);
    const now = this.clock.now();
    if (!player.pendingAttack || player.pendingAttack.expiresAt < now) {
      player.pendingAttack = null;
      throw new InvalidAction("no active attack grant — roll 3× Strike first");
    }
    if (targetId === playerId) throw new InvalidAction("cannot attack yourself");

    const target = this.repo.getOrThrow(targetId);
    const island = target.islands[target.currentIsland];
    if (!island) throw new InvalidAction("target has no island");
    const building = island.buildings[buildingIndex];
    if (!building) throw new InvalidAction(`invalid target building index ${buildingIndex}`);

    const bet = player.pendingAttack.bet;
    player.pendingAttack = null; // single-use grant

    let blocked = false;
    let reward = 0;
    const targetBuildingLevel = building.level;

    if (target.shields > 0) {
      target.shields -= 1;
      blocked = true;
    } else if (building.level > 0) {
      building.level -= 1;
      reward = Math.round(
        this.config.attack.baseAttack *
          targetBuildingLevel *
          villageMultiplier(this.config, target.currentIsland) *
          bet,
      );
      // Steal coins from the target — capped at what they actually hold.
      reward = Math.min(reward, target.coins);
      if (reward > 0) {
        this.ledger.transfer(target.id, player.id, "coins", reward, "ATTACK", now);
        target.coins -= reward;
        player.coins += reward;
      }
      // Defender gets a 24h revenge option (retention hook §5.3).
      target.revengeTargets.push({ attackerId: player.id, expiresAt: now + REVENGE_TTL_MS });
    }

    this.repo.save(target);
    this.repo.save(player);
    return { player, targetId, buildingIndex, blocked, reward, targetBuildingLevel };
  }

  // ---- Raid -------------------------------------------------------------

  private prepareRaid(player: Player, now: number): Player["pendingRaid"] {
    const candidates = this.matchmake(player, 1);
    if (candidates.length === 0) return null;
    const target = candidates[0];

    // Predetermine hidden coins per spot so the client can't probe/retry (§5.4).
    const cap = Math.floor(target.coins * this.config.raid.loyaltyCapPct);
    const total = this.config.raid.totalSpots;
    const spots: number[] = [];
    let remaining = cap;
    for (let i = 0; i < total; i++) {
      const slotsLeft = total - i;
      // Random share of the remaining cap, biased so later spots still hold value.
      const max = Math.max(0, Math.floor((remaining / slotsLeft) * 2));
      const amount = max > 0 ? this.rng.intBetween(0, max + 1) : 0;
      spots.push(amount);
      remaining = Math.max(0, remaining - amount);
    }
    return {
      targetId: target.id,
      spots,
      picks: this.config.raid.picks,
      grantedAt: now,
      expiresAt: now + ACTION_GRANT_TTL_MS,
    };
  }

  raidDig(playerId: string, picks: number[]): RaidResult {
    const player = this.getPlayer(playerId);
    const now = this.clock.now();
    const grant = player.pendingRaid;
    if (!grant || grant.expiresAt < now) {
      player.pendingRaid = null;
      throw new InvalidAction("no active raid grant — roll 3× Raid first");
    }
    const allowed = grant.picks;
    const unique = [...new Set(picks)];
    if (unique.length !== allowed) {
      throw new InvalidAction(`must pick exactly ${allowed} distinct spots`);
    }
    for (const i of unique) {
      if (!Number.isInteger(i) || i < 0 || i >= grant.spots.length) {
        throw new InvalidAction(`spot index out of range: ${i}`);
      }
    }

    const target = this.repo.get(grant.targetId);
    player.pendingRaid = null; // single-use grant

    let reward = unique.reduce((sum, i) => sum + grant.spots[i], 0);
    if (target) {
      reward = Math.min(reward, target.coins); // never over-drain a moving balance
      if (reward > 0) {
        this.ledger.transfer(target.id, player.id, "coins", reward, "RAID", now);
        target.coins -= reward;
        player.coins += reward;
        this.repo.save(target);
      }
    } else {
      reward = 0; // target vanished — no mint, books stay balanced
    }

    this.repo.save(player);
    return { player, targetId: grant.targetId, picks: unique, reward };
  }

  // ---- Gacha ------------------------------------------------------------

  summon(playerId: string): PullOutcome {
    const player = this.getPlayer(playerId);
    const now = this.clock.now();
    const cost = this.config.gacha.costSpiritTokens;
    if (player.spiritTokens < cost) throw new InsufficientFunds("spiritTokens", player.spiritTokens, cost);

    this.ledger.burn(player.id, "spiritTokens", cost, "GACHA_PULL", now);
    player.spiritTokens -= cost;

    const result = gachaPull(
      { pullsSinceEpic: player.pullsSinceEpic, pullsSinceMythic: player.pullsSinceMythic },
      this.config,
      this.rng,
    );
    player.pullsSinceEpic = result.pity.pullsSinceEpic;
    player.pullsSinceMythic = result.pity.pullsSinceMythic;

    const companion: Companion = { id: randomUUID(), rarity: result.rarity, summonedAt: now };
    player.companions.push(companion);

    this.repo.save(player);
    return { rarity: result.rarity, viaPity: result.viaPity, companion };
  }

  // ---- Matchmaking ------------------------------------------------------

  /** Candidates near the player's progression, with some coins worth taking. */
  private matchmake(player: Player, limit: number): Player[] {
    return this.repo
      .others(player.id)
      .map((p) => ({ p, dist: Math.abs(p.currentIsland - player.currentIsland) }))
      .sort((a, b) => a.dist - b.dist || b.p.coins - a.p.coins)
      .slice(0, limit)
      .map((x) => x.p);
  }

  // ---- Audit ------------------------------------------------------------

  getLedger(): Ledger {
    return this.ledger;
  }

  getConfig(): LiveOpsConfig {
    return this.config;
  }
}

export { GameError };
