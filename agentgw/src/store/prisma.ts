import { Prisma, PrismaClient } from '@prisma/client';
import type { AuditEntry, KeyRecord, NewKey, Store, UsageDelta, UsageTotals } from '../keys.js';
import { auditHash, canonicalJson } from './audit-hash.js';

/** Произволно, но постоянно число за pg_advisory_xact_lock — един писач на одит веригата. */
const AUDIT_LOCK = 7_307_001;

export class PrismaStore implements Store {
  constructor(private readonly db: PrismaClient) {}

  async createKey(input: NewKey & { hash: string; prefix: string }): Promise<KeyRecord> {
    return this.db.apiKey.create({ data: input });
  }

  async findKeyByHash(hash: string): Promise<KeyRecord | null> {
    return this.db.apiKey.findUnique({ where: { hash } });
  }

  async findKey(idOrPrefix: string): Promise<KeyRecord | null> {
    const byId = await this.db.apiKey.findUnique({ where: { id: idOrPrefix } });
    if (byId) return byId;
    const hits = await this.db.apiKey.findMany({
      where: { prefix: { startsWith: idOrPrefix } },
      take: 2,
    });
    return hits.length === 1 ? hits[0]! : null;
  }

  async listKeys(): Promise<KeyRecord[]> {
    return this.db.apiKey.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async updateKey(
    id: string,
    patch: Partial<Pick<KeyRecord, 'agents' | 'origins' | 'capMicroUsd' | 'ratePerMin'>> & {
      revoke?: boolean;
    },
  ): Promise<KeyRecord> {
    const { revoke, ...rest } = patch;
    return this.db.apiKey.update({
      where: { id },
      data: { ...rest, ...(revoke ? { active: false, revokedAt: new Date() } : {}) },
    });
  }

  async activePublicOrigins(): Promise<Set<string>> {
    const rows = await this.db.apiKey.findMany({
      where: { active: true, kind: 'PUBLIC' },
      select: { origins: true },
    });
    return new Set(rows.flatMap((r) => r.origins));
  }

  async monthUsage(keyId: string, month: string): Promise<UsageTotals> {
    const row = await this.db.usageMonthly.findUnique({ where: { keyId_month: { keyId, month } } });
    return {
      month,
      requests: row?.requests ?? 0,
      inputTokens: Number(row?.inputTokens ?? 0n),
      outputTokens: Number(row?.outputTokens ?? 0n),
      cacheReadTokens: Number(row?.cacheReadTokens ?? 0n),
      cacheWriteTokens: Number(row?.cacheWriteTokens ?? 0n),
      costMicroUsd: row?.costMicroUsd ?? 0n,
    };
  }

  async addUsage(keyId: string, month: string, d: UsageDelta): Promise<void> {
    await this.db.usageMonthly.upsert({
      where: { keyId_month: { keyId, month } },
      create: {
        keyId,
        month,
        requests: 1,
        inputTokens: BigInt(d.inputTokens),
        outputTokens: BigInt(d.outputTokens),
        cacheReadTokens: BigInt(d.cacheReadTokens),
        cacheWriteTokens: BigInt(d.cacheWriteTokens),
        costMicroUsd: d.costMicroUsd,
      },
      update: {
        requests: { increment: 1 },
        inputTokens: { increment: BigInt(d.inputTokens) },
        outputTokens: { increment: BigInt(d.outputTokens) },
        cacheReadTokens: { increment: BigInt(d.cacheReadTokens) },
        cacheWriteTokens: { increment: BigInt(d.cacheWriteTokens) },
        costMicroUsd: { increment: d.costMicroUsd },
      },
    });
  }

  async audit(entry: AuditEntry): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK})`;
      const last = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
      const prevHash = last?.hash ?? '';
      const at = new Date();
      await tx.auditLog.create({
        data: {
          at,
          actor: entry.actor,
          action: entry.action,
          keyId: entry.keyId ?? null,
          detail: entry.detail
            ? (JSON.parse(canonicalJson(entry.detail)) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          prevHash,
          hash: auditHash(prevHash, at, entry),
        },
      });
    });
  }
}
