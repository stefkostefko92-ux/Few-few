// Партидите и видовете семки: въвеждане, редакция, триене, смяна на скоростта.
import type { PrismaClient, SeedType } from '@prisma/client';
import type { RuleLike } from '../domain/alerts.js';
import { msLeft, rebase } from '../domain/decay.js';
import type { BatchCreateInput, BatchEditInput, SeedTypeInput } from '../domain/validation.js';
import { toBatchLike, toRuleLike, type BatchView } from './mapping.js';
import { syncNotifications } from './sync.js';

export interface Actor {
  id: string;
  name: string;
}

export type BatchSource = 'command' | 'dashboard';

export interface CreatedBatch {
  batch: BatchView;
  // Праговете, които партидата вече е минала при въвеждането (отбелязани тихо, без пинг).
  passed: RuleLike[];
}

export async function listSeedTypes(db: PrismaClient): Promise<SeedType[]> {
  return db.seedType.findMany({ orderBy: { sortOrder: 'asc' } });
}

export async function listBatches(db: PrismaClient): Promise<BatchView[]> {
  const rows = await db.batch.findMany({ include: { seedType: true }, orderBy: { id: 'asc' } });
  return rows.map(toBatchLike);
}

export async function createBatch(
  db: PrismaClient,
  input: BatchCreateInput,
  actor: Actor,
  source: BatchSource,
  now: Date,
): Promise<CreatedBatch> {
  return db.$transaction(async (tx) => {
    const row = await tx.batch.create({
      data: {
        seedTypeKey: input.seedTypeKey,
        count: input.count,
        percent: input.percent,
        anchoredAt: now,
        createdById: actor.id,
        createdByName: actor.name.slice(0, 100),
        source,
      },
      include: { seedType: true },
    });
    const { silenced } = await syncNotifications(tx, { batchIds: [row.id] }, now);
    const passed =
      silenced.length === 0
        ? []
        : await tx.alertRule.findMany({
            where: { id: { in: silenced.map((s) => s.ruleId) } },
            orderBy: { threshold: 'desc' },
          });
    return { batch: toBatchLike(row), passed: passed.map(toRuleLike) };
  });
}

// Новият брой и процент важат от `now`; вече минатите с тях прагове се отбелязват тихо.
export async function updateBatch(
  db: PrismaClient,
  id: number,
  input: BatchEditInput,
  now: Date,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const updated = await tx.batch.updateMany({
      where: { id },
      data: { count: input.count, percent: input.percent, anchoredAt: now },
    });
    if (updated.count === 0) return false;
    await syncNotifications(tx, { batchIds: [id] }, now);
    return true;
  });
}

export async function deleteBatch(db: PrismaClient, id: number): Promise<BatchView | null> {
  return db.$transaction(async (tx) => {
    const row = await tx.batch.findUnique({ where: { id }, include: { seedType: true } });
    if (!row) return null;
    await tx.batch.delete({ where: { id } });
    return toBatchLike(row);
  });
}

export async function deleteExpiredBatches(db: PrismaClient, now: Date): Promise<number> {
  const expired = (await listBatches(db)).filter((b) => msLeft(b, b.rate, now) <= 0);
  if (expired.length === 0) return 0;
  const { count } = await db.batch.deleteMany({ where: { id: { in: expired.map((b) => b.id) } } });
  return count;
}

// Новата скорост важи от `now`: всяка партида на вида пази текущия си процент и оттам пада с новата.
export async function updateSeedTypeRate(
  db: PrismaClient,
  key: string,
  input: SeedTypeInput,
  now: Date,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const type = await tx.seedType.findUnique({ where: { key } });
    if (!type) return false;
    const rows = await tx.batch.findMany({
      where: { seedTypeKey: key },
      include: { seedType: true },
    });
    for (const row of rows) {
      const b = toBatchLike(row);
      const next = rebase(b, b.rate, now);
      await tx.batch.update({
        where: { id: row.id },
        data: { percent: next.percent, anchoredAt: next.anchoredAt },
      });
    }
    await tx.seedType.update({
      where: { key },
      data: { decayPercent: input.decayPercent, decayMinutes: input.decayMinutes },
    });
    if (rows.length > 0) await syncNotifications(tx, { batchIds: rows.map((r) => r.id) }, now);
    return true;
  });
}
