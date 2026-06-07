import { randomUUID } from "node:crypto";
import type { LiveOpsConfig } from "../config/liveops.js";
import { MemoryLiveOpsStore, type LiveOpsStore } from "../config/liveOpsStore.js";
import type { Ledger } from "../data/ledger.js";
import type { PlayerRepository } from "../data/repository.js";
import { MemoryStore, type Store, type StoreTx } from "../data/store.js";
import { clampInc, regenSpins } from "../domain/economy.js";
import { pull as gachaPull } from "../domain/gacha.js";
import { buildingCost, islandIsComplete, makeIsland, villageMultiplier } from "../domain/islands.js";
import { cryptoRng, type Rng } from "../domain/rng.js";
import { drawReel, resolveSpin } from "../domain/spin.js";
import type { Companion, Currency, Player, SpinOutcome } from "../domain/types.js";
import { GameError, InsufficientFunds, InvalidAction } from "../errors.js";
import { systemClock, type Clock } from "./clock.js";
import { noopLeaderboard, type Leaderboard } from "./leaderboard.js";
import { noopAnalytics, type Analytics } from "../analytics/analytics.js";

const ACTION_GRANT_TTL_MS = 5 * 60_000; // a rolled attack/raid must be used within 5 min
const REVENGE_TTL_MS = 24 * 3_600_000;

/** Optional sink for clan-war points earned by aggressive actions (§7.2). */
export type ContributionSink = (playerId: string, points: number) => Promise<void>;

export interface GameServiceDeps {
  /** Transactional unit of work. Provide this, or `repo`+`ledger` to wrap a MemoryStore. */
  store?: Store;
  repo?: PlayerRepository;
  ledger?: Ledger;
  /** Either a fixed config (wrapped in a memory store) or a live-tunable store. */
  config?: LiveOpsConfig;
  liveOps?: LiveOpsStore;
  rng?: Rng;
  clock?: Clock;
  leaderboard?: Leaderboard;
  onContribution?: ContributionSink;
  analytics?: Analytics;
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
 * Application layer. Every value-bearing action resolves server-side inside a
 * single transaction (player save + ledger legs commit atomically — GDD §11.3),
 * then reports to external systems (leaderboard/analytics/clan war) after the
 * commit. The client only ever animates the returned result.
 */
export class GameService {
  private readonly store: Store;
  private readonly liveOps: LiveOpsStore;
  private readonly rng: Rng;
  private readonly clock: Clock;
  private readonly leaderboard: Leaderboard;
  private readonly onContribution: ContributionSink | undefined;
  private readonly analytics: Analytics;

  /** Current LiveOps config — read live so admin tuning takes effect at once (§6.2). */
  private get config(): LiveOpsConfig {
    return this.liveOps.get();
  }

  constructor(deps: GameServiceDeps) {
    if (deps.store) {
      this.store = deps.store;
    } else if (deps.repo && deps.ledger) {
      this.store = new MemoryStore(deps.repo, deps.ledger);
    } else {
      throw new Error("GameService requires `store` or both `repo` and `ledger`");
    }
    if (deps.liveOps) {
      this.liveOps = deps.liveOps;
    } else if (deps.config) {
      this.liveOps = new MemoryLiveOpsStore(deps.config);
    } else {
      throw new Error("GameService requires either `config` or `liveOps`");
    }
    this.rng = deps.rng ?? cryptoRng;
    this.clock = deps.clock ?? systemClock;
    this.leaderboard = deps.leaderboard ?? noopLeaderboard;
    this.onContribution = deps.onContribution;
    this.analytics = deps.analytics ?? noopAnalytics;
  }

  /** Clan-war points for a coin reward: 1 point per 100 coins, min 1. */
  private async contribute(playerId: string, reward: number): Promise<void> {
    if (!this.onContribution || reward <= 0) return;
    await this.onContribution(playerId, Math.max(1, Math.round(reward / 100)));
  }

  /** Load a player and reconcile spin regen — inside the caller's transaction. */
  private async loadPlayer(tx: StoreTx, id: string, now: number): Promise<Player> {
    const player = await tx.players.getOrThrow(id);
    const { spins, spinsUpdatedAt } = regenSpins(
      player.spins,
      player.spinsUpdatedAt,
      now,
      this.config.spins.regenPerHour,
      this.config.spins.cap,
    );
    if (spins !== player.spins || spinsUpdatedAt !== player.spinsUpdatedAt) {
      const gained = spins - player.spins;
      if (gained > 0) await tx.ledger.mint(player.id, "spins", gained, "SPIN_REGEN", now);
      player.spins = spins;
      player.spinsUpdatedAt = spinsUpdatedAt;
      await tx.players.save(player);
    }
    return player;
  }

  // ---- Player lifecycle -------------------------------------------------

  async createPlayer(name: string): Promise<Player> {
    const now = this.clock.now();
    const id = randomUUID();
    const player = await this.store.transaction(async (tx) => {
      const fresh: Player = {
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
        clanId: null,
        pendingAttack: null,
        pendingRaid: null,
      };
      await tx.players.create(fresh);
      // Starting bonus minted through the ledger so the books balance from t0.
      await tx.ledger.mint(id, "spins", this.config.spins.startingBonus, "STARTING_BONUS", now);
      fresh.spins = this.config.spins.startingBonus;
      await tx.players.save(fresh);
      return fresh;
    });
    await this.leaderboard.report(player);
    return player;
  }

  /** Reconciles spin regen lazily on read and persists the result. */
  async getPlayer(id: string): Promise<Player> {
    const now = this.clock.now();
    return this.store.transaction((tx) => this.loadPlayer(tx, id, now));
  }

  // ---- Core loop: spin --------------------------------------------------

  async spin(playerId: string, betMultiplier: number): Promise<{ outcome: SpinOutcome; player: Player }> {
    const now = this.clock.now();
    const bet = Math.trunc(betMultiplier);
    if (!Number.isFinite(bet) || bet < 1) throw new InvalidAction("bet must be >= 1");

    const { outcome, player } = await this.store.transaction(async (tx) => {
      const player = await this.loadPlayer(tx, playerId, now);
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

      await tx.ledger.burn(player.id, "spins", bet, "SPIN", now);
      player.spins -= bet;

      if (outcome.coins > 0) {
        await tx.ledger.mint(player.id, "coins", outcome.coins, "SPIN_COINS", now);
        player.coins += outcome.coins;
      }
      if (outcome.spiritTokens > 0) {
        await tx.ledger.mint(player.id, "spiritTokens", outcome.spiritTokens, "SPIN_SPIRIT", now);
        player.spiritTokens += outcome.spiritTokens;
      }
      if (outcome.shields > 0) {
        // Shields are a capped, non-tradable resource — on the player, not the ledger.
        player.shields = clampInc(player.shields, outcome.shields, this.config.payouts.shieldCap);
      }
      if (outcome.action === "ATTACK") {
        player.pendingAttack = { bet, grantedAt: now, expiresAt: now + ACTION_GRANT_TTL_MS };
      }
      if (outcome.action === "RAID") {
        player.pendingRaid = await this.prepareRaid(tx, player, now);
      }
      await tx.players.save(player);
      return { outcome, player };
    });

    await this.leaderboard.report(player);
    this.analytics.track({ type: "SPIN", playerId: player.id, at: now, bet, outcome: outcome.type, coins: outcome.coins });
    return { outcome, player };
  }

  // ---- Build loop -------------------------------------------------------

  async build(playerId: string, buildingIndex: number): Promise<BuildResult> {
    const now = this.clock.now();
    const result = await this.store.transaction(async (tx): Promise<BuildResult> => {
      const player = await this.loadPlayer(tx, playerId, now);
      const island = player.islands[player.currentIsland];
      if (!island) throw new InvalidAction("current island not found");
      const building = island.buildings[buildingIndex];
      if (!building) throw new InvalidAction(`invalid building index ${buildingIndex}`);
      if (building.level >= this.config.islands.levelsPerBuilding) {
        throw new InvalidAction("building already at max level");
      }

      const cost = buildingCost(this.config, island.index, buildingIndex, building.level);
      if (player.coins < cost) throw new InsufficientFunds("coins", player.coins, cost);

      await tx.ledger.burn(player.id, "coins", cost, "BUILD", now);
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

      await tx.players.save(player);
      return { player, buildingIndex, newLevel: building.level, cost, islandCompleted: island.completed, unlockedIsland };
    });

    await this.leaderboard.report(result.player);
    this.analytics.track({ type: "BUILD", playerId: result.player.id, at: now, buildingIndex, newLevel: result.newLevel, cost: result.cost, unlockedIsland: result.unlockedIsland });
    return result;
  }

  // ---- Attack -----------------------------------------------------------

  /** Matchmaking candidate pool for the player's open attack/raid grant (§11.2). */
  async attackCandidates(playerId: string, limit = 5): Promise<{ id: string; name: string; island: number }[]> {
    const now = this.clock.now();
    return this.store.transaction(async (tx) => {
      const player = await this.loadPlayer(tx, playerId, now);
      const candidates = await this.matchmake(tx, player, limit);
      return candidates.map((p) => ({ id: p.id, name: p.name, island: p.currentIsland }));
    });
  }

  async attack(playerId: string, targetId: string, buildingIndex: number): Promise<AttackResult> {
    const now = this.clock.now();
    if (targetId === playerId) throw new InvalidAction("cannot attack yourself");

    const { result, target } = await this.store.transaction(async (tx) => {
      const player = await this.loadPlayer(tx, playerId, now);
      if (!player.pendingAttack || player.pendingAttack.expiresAt < now) {
        player.pendingAttack = null;
        await tx.players.save(player);
        throw new InvalidAction("no active attack grant — roll 3× Strike first");
      }
      const target = await tx.players.getOrThrow(targetId);
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
          this.config.attack.baseAttack * targetBuildingLevel * villageMultiplier(this.config, target.currentIsland) * bet,
        );
        reward = Math.min(reward, target.coins);
        if (reward > 0) {
          await tx.ledger.transfer(target.id, player.id, "coins", reward, "ATTACK", now);
          target.coins -= reward;
          player.coins += reward;
        }
        target.revengeTargets.push({ attackerId: player.id, expiresAt: now + REVENGE_TTL_MS });
      }

      await tx.players.save(target);
      await tx.players.save(player);
      return { result: { player, targetId, buildingIndex, blocked, reward, targetBuildingLevel }, target };
    });

    await this.leaderboard.report(target);
    await this.leaderboard.report(result.player);
    await this.contribute(result.player.id, result.reward);
    this.analytics.track({ type: "ATTACK", playerId: result.player.id, at: now, targetId, blocked: result.blocked, reward: result.reward });
    return result;
  }

  // ---- Raid -------------------------------------------------------------

  private async prepareRaid(tx: StoreTx, player: Player, now: number): Promise<Player["pendingRaid"]> {
    const candidates = await this.matchmake(tx, player, 1);
    if (candidates.length === 0) return null;
    const target = candidates[0];

    // Predetermine hidden coins per spot so the client can't probe/retry (§5.4).
    const cap = Math.floor(target.coins * this.config.raid.loyaltyCapPct);
    const total = this.config.raid.totalSpots;
    const spots: number[] = [];
    let remaining = cap;
    for (let i = 0; i < total; i++) {
      const slotsLeft = total - i;
      const max = Math.max(0, Math.floor((remaining / slotsLeft) * 2));
      const amount = max > 0 ? this.rng.intBetween(0, max + 1) : 0;
      spots.push(amount);
      remaining = Math.max(0, remaining - amount);
    }
    return { targetId: target.id, spots, picks: this.config.raid.picks, grantedAt: now, expiresAt: now + ACTION_GRANT_TTL_MS };
  }

  async raidDig(playerId: string, picks: number[]): Promise<RaidResult> {
    const now = this.clock.now();
    const { result, target } = await this.store.transaction(async (tx) => {
      const player = await this.loadPlayer(tx, playerId, now);
      const grant = player.pendingRaid;
      if (!grant || grant.expiresAt < now) {
        player.pendingRaid = null;
        await tx.players.save(player);
        throw new InvalidAction("no active raid grant — roll 3× Raid first");
      }
      const allowed = grant.picks;
      const unique = [...new Set(picks)];
      if (unique.length !== allowed) throw new InvalidAction(`must pick exactly ${allowed} distinct spots`);
      for (const i of unique) {
        if (!Number.isInteger(i) || i < 0 || i >= grant.spots.length) {
          throw new InvalidAction(`spot index out of range: ${i}`);
        }
      }

      const target = await tx.players.get(grant.targetId);
      player.pendingRaid = null; // single-use grant

      let reward = unique.reduce((sum, i) => sum + grant.spots[i], 0);
      if (target) {
        reward = Math.min(reward, target.coins); // never over-drain a moving balance
        if (reward > 0) {
          await tx.ledger.transfer(target.id, player.id, "coins", reward, "RAID", now);
          target.coins -= reward;
          player.coins += reward;
          await tx.players.save(target);
        }
      } else {
        reward = 0; // target vanished — no mint, books stay balanced
      }

      await tx.players.save(player);
      return { result: { player, targetId: grant.targetId, picks: unique, reward }, target };
    });

    if (target && result.reward > 0) await this.leaderboard.report(target);
    await this.leaderboard.report(result.player);
    await this.contribute(result.player.id, result.reward);
    this.analytics.track({ type: "RAID", playerId: result.player.id, at: now, targetId: result.targetId, reward: result.reward });
    return result;
  }

  // ---- Gacha ------------------------------------------------------------

  async summon(playerId: string): Promise<PullOutcome> {
    const now = this.clock.now();
    const out = await this.store.transaction(async (tx): Promise<PullOutcome> => {
      const player = await this.loadPlayer(tx, playerId, now);
      const cost = this.config.gacha.costSpiritTokens;
      if (player.spiritTokens < cost) throw new InsufficientFunds("spiritTokens", player.spiritTokens, cost);

      await tx.ledger.burn(player.id, "spiritTokens", cost, "GACHA_PULL", now);
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
      await tx.players.save(player);
      return { rarity: result.rarity, viaPity: result.viaPity, companion };
    });

    this.analytics.track({ type: "SUMMON", playerId, at: now, rarity: out.rarity, viaPity: out.viaPity });
    return out;
  }

  // ---- Entitlements (IAP, rewards) -------------------------------------

  /**
   * Credit currencies to a player through the ledger (e.g. a verified IAP).
   * Spins may exceed the regen cap here — purchased balances are preserved.
   */
  async grant(playerId: string, grants: Partial<Record<Currency, number>>, reason: string): Promise<Player> {
    const now = this.clock.now();
    const player = await this.store.transaction(async (tx) => {
      const player = await this.loadPlayer(tx, playerId, now);
      const fields: Currency[] = ["spins", "coins", "spiritTokens", "gems"];
      for (const cur of fields) {
        const amount = grants[cur];
        if (!amount) continue;
        if (amount < 0) throw new InvalidAction(`grant amount for ${cur} must be non-negative`);
        await tx.ledger.mint(player.id, cur, amount, reason, now);
        player[cur] += amount;
      }
      await tx.players.save(player);
      return player;
    });
    await this.leaderboard.report(player);
    return player;
  }

  // ---- Leaderboard ------------------------------------------------------

  async leaderboardTop(n: number) {
    return this.leaderboard.top(n);
  }

  async leaderboardRank(playerId: string) {
    return this.leaderboard.rankOf(playerId);
  }

  // ---- Matchmaking ------------------------------------------------------

  /** Candidates near the player's progression, with some coins worth taking. */
  private async matchmake(tx: StoreTx, player: Player, limit: number): Promise<Player[]> {
    const others = await tx.players.others(player.id);
    return others
      .map((p) => ({ p, dist: Math.abs(p.currentIsland - player.currentIsland) }))
      .sort((a, b) => a.dist - b.dist || b.p.coins - a.p.coins)
      .slice(0, limit)
      .map((x) => x.p);
  }

  // ---- Audit ------------------------------------------------------------

  getConfig(): LiveOpsConfig {
    return this.config;
  }
}

export { GameError };
