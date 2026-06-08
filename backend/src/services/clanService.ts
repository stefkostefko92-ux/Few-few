import { randomUUID } from "node:crypto";
import type { ClanRepository } from "../data/clanRepository.js";
import type { PlayerRepository } from "../data/repository.js";
import { MemoryStore, type Store, type StoreTx } from "../data/store.js";
import { CLAN_MAX_MEMBERS, CLAN_WAR_DURATION_MS, type Clan, type ClanWar } from "../domain/clanTypes.js";
import { GameError } from "../errors.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";

export interface ClanServiceDeps {
  clanRepo: ClanRepository;
  playerRepo: PlayerRepository;
  /** Transactional unit of work for mutations. Defaults to a MemoryStore wrapping the repos. */
  store?: Store;
  clock?: Clock;
}

export interface WarStatus {
  warId: string;
  myClanId: string;
  opponentClanId: string;
  myScore: number;
  opponentScore: number;
  endsAt: number;
  active: boolean;
}

/**
 * Clan membership and clan wars (GDD §7.2). Membership is capped at 50; a clan
 * leader can declare war on another warless clan, after which members' raid and
 * attack wins contribute points to the clan's war score. Every mutation that
 * touches more than one row (clan + player, or a war score read-modify-write)
 * runs inside a transactional unit of work so the 50-member cap and war scores
 * hold under concurrency and can't be left half-applied by a crash (§11.3).
 */
export class ClanService {
  private readonly clanRepo: ClanRepository;
  private readonly playerRepo: PlayerRepository;
  private readonly store: Store;
  private readonly clock: Clock;

  constructor(deps: ClanServiceDeps) {
    this.clanRepo = deps.clanRepo;
    this.playerRepo = deps.playerRepo;
    this.store = deps.store ?? new MemoryStore(deps.playerRepo, undefined, undefined, deps.clanRepo);
    this.clock = deps.clock ?? systemClock;
  }

  async createClan(playerId: string, name: string, tag: string): Promise<Clan> {
    return this.store.transaction(async (tx) => {
      const player = await tx.players.getOrThrow(playerId);
      if (player.clanId) throw new GameError("ALREADY_IN_CLAN", "leave your current clan first", 409);

      const clan: Clan = {
        id: randomUUID(),
        name,
        tag,
        leaderId: playerId,
        memberIds: [playerId],
        currentWarId: null,
        createdAt: this.clock.now(),
      };
      await tx.clans.create(clan);
      player.clanId = clan.id;
      await tx.players.save(player);
      return clan;
    });
  }

  async joinClan(playerId: string, clanId: string): Promise<Clan> {
    return this.store.transaction(async (tx) => {
      const player = await tx.players.getOrThrow(playerId);
      if (player.clanId) throw new GameError("ALREADY_IN_CLAN", "leave your current clan first", 409);
      await tx.clans.lockForUpdate(clanId); // serialize concurrent joins before the cap check
      const clan = await tx.clans.getOrThrow(clanId);
      if (clan.memberIds.length >= CLAN_MAX_MEMBERS) {
        throw new GameError("CLAN_FULL", `clan is full (${CLAN_MAX_MEMBERS})`, 409);
      }
      if (!clan.memberIds.includes(playerId)) clan.memberIds.push(playerId);
      await tx.clans.save(clan);
      player.clanId = clan.id;
      await tx.players.save(player);
      return clan;
    });
  }

  async leaveClan(playerId: string): Promise<void> {
    await this.store.transaction(async (tx) => {
      const player = await tx.players.getOrThrow(playerId);
      if (!player.clanId) throw new GameError("NOT_IN_CLAN", "you are not in a clan", 409);
      await tx.clans.lockForUpdate(player.clanId);
      const clan = await tx.clans.getOrThrow(player.clanId);

      clan.memberIds = clan.memberIds.filter((id) => id !== playerId);
      player.clanId = null;
      await tx.players.save(player);

      if (clan.memberIds.length === 0) {
        // Last member out — disband, releasing any war opponent.
        await this.releaseWarOpponent(tx, clan);
        await tx.clans.delete(clan.id);
        return;
      }
      if (clan.leaderId === playerId) clan.leaderId = clan.memberIds[0]; // promote next member
      await tx.clans.save(clan);
    });
  }

  async getClan(clanId: string): Promise<Clan> {
    return this.clanRepo.getOrThrow(clanId);
  }

  async listClans(limit = 20): Promise<Clan[]> {
    return this.clanRepo.list(limit);
  }

  /** Leader declares war; an opponent is matchmade from warless clans. */
  async declareWar(playerId: string): Promise<WarStatus> {
    return this.store.transaction(async (tx) => {
      const player = await tx.players.getOrThrow(playerId);
      if (!player.clanId) throw new GameError("NOT_IN_CLAN", "you are not in a clan", 409);
      await tx.clans.lockForUpdate(player.clanId);
      const clan = await tx.clans.getOrThrow(player.clanId);
      if (clan.leaderId !== playerId) throw new GameError("NOT_LEADER", "only the clan leader can declare war", 403);
      if (clan.currentWarId) throw new GameError("ALREADY_AT_WAR", "clan is already at war", 409);

      const opponents = await tx.clans.warlessOthers(clan.id, 1);
      if (opponents.length === 0) throw new GameError("NO_OPPONENT", "no available opponent clan", 409);
      const opponent = opponents[0];

      const now = this.clock.now();
      const war: ClanWar = {
        id: randomUUID(),
        clanAId: clan.id,
        clanBId: opponent.id,
        scoreA: 0,
        scoreB: 0,
        startedAt: now,
        endsAt: now + CLAN_WAR_DURATION_MS,
      };
      await tx.clans.createWar(war);
      clan.currentWarId = war.id;
      opponent.currentWarId = war.id;
      await tx.clans.save(clan);
      await tx.clans.save(opponent);
      return this.toStatus(war, clan.id);
    });
  }

  /** Add war points for a player's clan (called on raid/attack wins). */
  async contribute(playerId: string, points: number): Promise<void> {
    if (points <= 0) return;
    await this.store.transaction(async (tx) => {
      const player = await tx.players.get(playerId);
      if (!player?.clanId) return;
      const clan = await tx.clans.get(player.clanId);
      if (!clan?.currentWarId) return;
      const war = await tx.clans.getWar(clan.currentWarId);
      if (!war || this.clock.now() > war.endsAt) return;

      const side = war.clanAId === clan.id ? "A" : war.clanBId === clan.id ? "B" : null;
      if (!side) return;
      await tx.clans.incrementWarScore(war.id, side, points);
    });
  }

  async warStatus(playerId: string): Promise<WarStatus | null> {
    const player = await this.playerRepo.getOrThrow(playerId);
    if (!player.clanId) return null;
    const clan = await this.clanRepo.getOrThrow(player.clanId);
    if (!clan.currentWarId) return null;
    const war = await this.clanRepo.getWar(clan.currentWarId);
    return war ? this.toStatus(war, clan.id) : null;
  }

  private async releaseWarOpponent(tx: StoreTx, clan: Clan): Promise<void> {
    if (!clan.currentWarId) return;
    const war = await tx.clans.getWar(clan.currentWarId);
    if (!war) return;
    const otherId = war.clanAId === clan.id ? war.clanBId : war.clanAId;
    const other = await tx.clans.get(otherId);
    if (other && other.currentWarId === war.id) {
      other.currentWarId = null;
      await tx.clans.save(other);
    }
  }

  private toStatus(war: ClanWar, myClanId: string): WarStatus {
    const isA = war.clanAId === myClanId;
    return {
      warId: war.id,
      myClanId,
      opponentClanId: isA ? war.clanBId : war.clanAId,
      myScore: isA ? war.scoreA : war.scoreB,
      opponentScore: isA ? war.scoreB : war.scoreA,
      endsAt: war.endsAt,
      active: this.clock.now() <= war.endsAt,
    };
  }
}
