import type { Clan, ClanWar } from "../domain/clanTypes.js";

/**
 * Clan persistence boundary. Memory and Prisma implementations mirror each
 * other. Member lists are stored on the clan; the player also carries `clanId`
 * for O(1) "which clan am I in" lookups.
 */
export interface ClanRepository {
  create(clan: Clan): Promise<Clan>;
  get(id: string): Promise<Clan | undefined>;
  getOrThrow(id: string): Promise<Clan>;
  save(clan: Clan): Promise<void>;
  delete(id: string): Promise<void>;
  list(limit: number): Promise<Clan[]>;
  /** Clans not currently in a war — candidate opponents for war matchmaking. */
  warlessOthers(excludeClanId: string, limit: number): Promise<Clan[]>;
  /**
   * Take a row lock on a clan inside the current transaction so concurrent
   * membership mutations serialize (the member-cap check is a read-modify-write
   * that would otherwise race under READ COMMITTED). No-op in memory.
   */
  lockForUpdate(id: string): Promise<void>;

  createWar(war: ClanWar): Promise<ClanWar>;
  getWar(id: string): Promise<ClanWar | undefined>;
  saveWar(war: ClanWar): Promise<void>;
  /** Atomically add points to one side's war score (avoids lost updates). */
  incrementWarScore(warId: string, side: "A" | "B", points: number): Promise<void>;
}

export class ClanNotFoundError extends Error {
  constructor(id: string) {
    super(`clan not found: ${id}`);
    this.name = "ClanNotFoundError";
  }
}

export class MemoryClanRepository implements ClanRepository {
  private readonly clans = new Map<string, Clan>();
  private readonly wars = new Map<string, ClanWar>();

  async create(clan: Clan): Promise<Clan> {
    this.clans.set(clan.id, clan);
    return clan;
  }

  async get(id: string): Promise<Clan | undefined> {
    return this.clans.get(id);
  }

  async getOrThrow(id: string): Promise<Clan> {
    const c = this.clans.get(id);
    if (!c) throw new ClanNotFoundError(id);
    return c;
  }

  async save(clan: Clan): Promise<void> {
    this.clans.set(clan.id, clan);
  }

  async delete(id: string): Promise<void> {
    this.clans.delete(id);
  }

  async list(limit: number): Promise<Clan[]> {
    return [...this.clans.values()]
      .sort((a, b) => b.memberIds.length - a.memberIds.length)
      .slice(0, limit);
  }

  async warlessOthers(excludeClanId: string, limit: number): Promise<Clan[]> {
    return [...this.clans.values()]
      .filter((c) => c.id !== excludeClanId && c.currentWarId === null && c.memberIds.length > 0)
      .slice(0, limit);
  }

  async lockForUpdate(): Promise<void> {
    // No-op: the in-memory store is single-threaded with no real isolation.
  }

  async createWar(war: ClanWar): Promise<ClanWar> {
    this.wars.set(war.id, war);
    return war;
  }

  async getWar(id: string): Promise<ClanWar | undefined> {
    return this.wars.get(id);
  }

  async saveWar(war: ClanWar): Promise<void> {
    this.wars.set(war.id, war);
  }

  async incrementWarScore(warId: string, side: "A" | "B", points: number): Promise<void> {
    const war = this.wars.get(warId);
    if (!war) return;
    if (side === "A") war.scoreA += points;
    else war.scoreB += points;
  }
}
