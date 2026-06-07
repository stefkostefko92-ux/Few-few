import type { Player } from "../domain/types.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { PlayerNotFoundError, type PlayerRepository } from "./repository.js";

/**
 * Postgres-backed PlayerRepository (GDD §11.2). Persists the Player aggregate as
 * scalar currency columns plus JSONB for the nested island/companion/grant
 * structures. `coins` and `spinsUpdatedAt` are BigInt in the DB and converted at
 * this boundary so the domain stays in plain numbers.
 */
export class PrismaPlayerRepository implements PlayerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(player: Player): Promise<Player> {
    await this.prisma.player.create({ data: toRow(player) });
    return player;
  }

  async get(id: string): Promise<Player | undefined> {
    const row = await this.prisma.player.findUnique({ where: { id } });
    return row ? fromRow(row) : undefined;
  }

  async getOrThrow(id: string): Promise<Player> {
    const p = await this.get(id);
    if (!p) throw new PlayerNotFoundError(id);
    return p;
  }

  async save(player: Player): Promise<void> {
    const data = toRow(player);
    // create() already inserted the row; save() always updates.
    await this.prisma.player.update({ where: { id: player.id }, data });
  }

  async others(excludeId: string): Promise<Player[]> {
    // Matchmaking pool. Bounded so a growing player base doesn't load everyone;
    // production narrows this with an MMR/level index (§11.2).
    const rows = await this.prisma.player.findMany({
      where: { id: { not: excludeId } },
      orderBy: { coins: "desc" },
      take: 200,
    });
    return rows.map(fromRow);
  }
}

// ---- Row mapping --------------------------------------------------------

interface PlayerRow {
  id: string;
  name: string;
  createdAt: Date;
  spins: number;
  coins: bigint;
  spiritTokens: number;
  gems: number;
  spinsUpdatedAt: bigint;
  shields: number;
  currentIsland: number;
  islands: unknown;
  pullsSinceEpic: number;
  pullsSinceMythic: number;
  companions: unknown;
  revengeTargets: unknown;
  pendingAttack: unknown;
  pendingRaid: unknown;
}

function toRow(p: Player) {
  return {
    id: p.id,
    name: p.name,
    createdAt: new Date(p.createdAt),
    spins: p.spins,
    coins: BigInt(Math.round(p.coins)),
    spiritTokens: p.spiritTokens,
    gems: p.gems,
    spinsUpdatedAt: BigInt(Math.round(p.spinsUpdatedAt)),
    shields: p.shields,
    currentIsland: p.currentIsland,
    islands: p.islands as unknown as object,
    pullsSinceEpic: p.pullsSinceEpic,
    pullsSinceMythic: p.pullsSinceMythic,
    companions: p.companions as unknown as object,
    revengeTargets: p.revengeTargets as unknown as object,
    pendingAttack: (p.pendingAttack ?? null) as unknown as object,
    pendingRaid: (p.pendingRaid ?? null) as unknown as object,
  };
}

function fromRow(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.getTime(),
    spins: row.spins,
    coins: Number(row.coins),
    spiritTokens: row.spiritTokens,
    gems: row.gems,
    spinsUpdatedAt: Number(row.spinsUpdatedAt),
    shields: row.shields,
    currentIsland: row.currentIsland,
    islands: row.islands as Player["islands"],
    pullsSinceEpic: row.pullsSinceEpic,
    pullsSinceMythic: row.pullsSinceMythic,
    companions: row.companions as Player["companions"],
    revengeTargets: row.revengeTargets as Player["revengeTargets"],
    pendingAttack: (row.pendingAttack ?? null) as Player["pendingAttack"],
    pendingRaid: (row.pendingRaid ?? null) as Player["pendingRaid"],
  };
}
