import type { PrismaClient } from '@prisma/client';
import type { Channel, ConsentRecord, RegistryName } from '../compliance/types.js';
import { newest } from './newest.js';
import type {
  ComplianceStore,
  ConsentInput,
  RegistryResultInput,
  StoredRegistryResult,
  SuppressionScope,
} from './types.js';

const BATCH = 5_000;

/** Продукционното хранилище — същият договор като MemoryStore. */
export class PrismaStore implements ComplianceStore {
  constructor(private readonly db: PrismaClient) {}

  async saveRegistryResults(
    registry: RegistryName,
    entries: RegistryResultInput[],
    checkedAt: Date,
    source: string,
  ): Promise<number> {
    await this.db.$transaction(async (tx) => {
      for (let i = 0; i < entries.length; i += BATCH) {
        await tx.registryResult.createMany({
          data: entries.slice(i, i + BATCH).map((e) => ({ registry, checkedAt, source, ...e })),
        });
      }
    });
    return entries.length;
  }

  async latestRegistryResult(
    registry: RegistryName,
    fingerprints: string[],
  ): Promise<StoredRegistryResult | null> {
    const rows = await this.db.registryResult.findMany({
      where: { registry, fingerprint: { in: fingerprints } },
      orderBy: { checkedAt: 'desc' },
      take: 20,
      select: { listed: true, checkedAt: true },
    });
    return rows.reduce<StoredRegistryResult | null>((best, r) => newest(best, r), null);
  }

  async saveSnapshot(
    registry: RegistryName,
    takenAt: Date,
    fingerprints: string[],
    source: string,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const snap = await tx.registrySnapshot.create({ data: { registry, takenAt, source } });
      for (let i = 0; i < fingerprints.length; i += BATCH) {
        await tx.registrySnapshotEntry.createMany({
          data: fingerprints
            .slice(i, i + BATCH)
            .map((fingerprint) => ({ snapshotId: snap.id, fingerprint })),
          skipDuplicates: true,
        });
      }
    });
  }

  async latestSnapshotResult(
    registry: RegistryName,
    fingerprints: string[],
  ): Promise<StoredRegistryResult | null> {
    const snap = await this.db.registrySnapshot.findFirst({
      where: { registry },
      orderBy: { takenAt: 'desc' },
      select: { id: true, takenAt: true },
    });
    if (!snap) return null;
    const hit = await this.db.registrySnapshotEntry.findFirst({
      where: { snapshotId: snap.id, fingerprint: { in: fingerprints } },
      select: { fingerprint: true },
    });
    return { listed: hit !== null, checkedAt: snap.takenAt };
  }

  async isSuppressed(fingerprints: string[]): Promise<boolean> {
    return (await this.db.suppression.count({ where: { fingerprint: { in: fingerprints } } })) > 0;
  }

  async addSuppression(
    fingerprint: string,
    scope: SuppressionScope,
    reason: string,
  ): Promise<void> {
    await this.db.suppression.upsert({
      where: { fingerprint },
      create: { fingerprint, scope, reason },
      update: {},
    });
  }

  async consentsFor(fingerprint: string, channel?: Channel): Promise<ConsentRecord[]> {
    return this.db.consent.findMany({
      where: { fingerprint, ...(channel ? { channel } : {}) },
      select: { channel: true, givenAt: true, withdrawnAt: true },
    });
  }

  async addConsent(fingerprint: string, consent: ConsentInput): Promise<void> {
    const { channel, givenAt, withdrawnAt, method, wording } = consent;
    await this.db.consent.create({
      data: { fingerprint, channel, givenAt, withdrawnAt, method, wording },
    });
  }
}
