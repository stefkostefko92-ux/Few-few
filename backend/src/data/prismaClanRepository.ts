import type { Clan, ClanWar } from "../domain/clanTypes.js";
import { ClanNotFoundError, type ClanRepository } from "./clanRepository.js";
import type { PrismaClient } from "./prismaClient.js";

/** Postgres-backed ClanRepository (§7.2). */
export class PrismaClanRepository implements ClanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(clan: Clan): Promise<Clan> {
    await this.prisma.clan.create({ data: toClanRow(clan) });
    return clan;
  }

  async get(id: string): Promise<Clan | undefined> {
    const row = await this.prisma.clan.findUnique({ where: { id } });
    return row ? fromClanRow(row) : undefined;
  }

  async getOrThrow(id: string): Promise<Clan> {
    const c = await this.get(id);
    if (!c) throw new ClanNotFoundError(id);
    return c;
  }

  async save(clan: Clan): Promise<void> {
    await this.prisma.clan.update({
      where: { id: clan.id },
      data: {
        name: clan.name,
        tag: clan.tag,
        leaderId: clan.leaderId,
        memberIds: clan.memberIds as object,
        currentWarId: clan.currentWarId,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.clan.delete({ where: { id } });
  }

  async list(limit: number): Promise<Clan[]> {
    const rows = await this.prisma.clan.findMany({ take: limit, orderBy: { createdAt: "desc" } });
    return rows.map(fromClanRow);
  }

  async warlessOthers(excludeClanId: string, limit: number): Promise<Clan[]> {
    const rows = await this.prisma.clan.findMany({
      where: { id: { not: excludeClanId }, currentWarId: null },
      take: limit,
    });
    return rows.map(fromClanRow).filter((c) => c.memberIds.length > 0);
  }

  async createWar(war: ClanWar): Promise<ClanWar> {
    await this.prisma.clanWar.create({ data: toWarRow(war) });
    return war;
  }

  async getWar(id: string): Promise<ClanWar | undefined> {
    const row = await this.prisma.clanWar.findUnique({ where: { id } });
    return row ? fromWarRow(row) : undefined;
  }

  async saveWar(war: ClanWar): Promise<void> {
    await this.prisma.clanWar.update({
      where: { id: war.id },
      data: { scoreA: war.scoreA, scoreB: war.scoreB },
    });
  }
}

interface ClanRow {
  id: string;
  name: string;
  tag: string;
  leaderId: string;
  memberIds: unknown;
  currentWarId: string | null;
  createdAt: Date;
}

function toClanRow(c: Clan) {
  return {
    id: c.id,
    name: c.name,
    tag: c.tag,
    leaderId: c.leaderId,
    memberIds: c.memberIds as object,
    currentWarId: c.currentWarId,
    createdAt: new Date(c.createdAt),
  };
}

function fromClanRow(row: ClanRow): Clan {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    leaderId: row.leaderId,
    memberIds: row.memberIds as string[],
    currentWarId: row.currentWarId,
    createdAt: row.createdAt.getTime(),
  };
}

interface WarRow {
  id: string;
  clanAId: string;
  clanBId: string;
  scoreA: number;
  scoreB: number;
  startedAt: Date;
  endsAt: Date;
}

function toWarRow(w: ClanWar) {
  return {
    id: w.id,
    clanAId: w.clanAId,
    clanBId: w.clanBId,
    scoreA: w.scoreA,
    scoreB: w.scoreB,
    startedAt: new Date(w.startedAt),
    endsAt: new Date(w.endsAt),
  };
}

function fromWarRow(row: WarRow): ClanWar {
  return {
    id: row.id,
    clanAId: row.clanAId,
    clanBId: row.clanBId,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    startedAt: row.startedAt.getTime(),
    endsAt: row.endsAt.getTime(),
  };
}
