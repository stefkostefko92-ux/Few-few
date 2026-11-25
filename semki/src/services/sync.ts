// След всяка ръчна промяна (нова/редактирана партида, правило, скорост) двойките (партида, правило) в
// обхвата стават точно дължимите в момента: вече минатите прагове се отбелязват тихо (без пинг), а
// недължимите се махат, за да пингнат, когато времето ги стигне. Пинг има само при праг, минат с времето.
import type { Prisma } from '@prisma/client';
import { isDue, pairKey } from '../domain/alerts.js';
import { toBatchLike, toRuleLike } from './mapping.js';

export interface SyncScope {
  batchIds?: number[];
  ruleIds?: number[];
}

export interface SyncResult {
  silenced: Array<{ batchId: number; ruleId: number }>;
}

export async function syncNotifications(
  tx: Prisma.TransactionClient,
  scope: SyncScope,
  now: Date,
): Promise<SyncResult> {
  const batchRows = await tx.batch.findMany({
    where: scope.batchIds ? { id: { in: scope.batchIds } } : {},
    include: { seedType: true },
  });
  const ruleRows = await tx.alertRule.findMany({
    where: scope.ruleIds ? { id: { in: scope.ruleIds } } : {},
  });
  if (batchRows.length === 0 || ruleRows.length === 0) return { silenced: [] };

  const batches = batchRows.map(toBatchLike);
  const rules = ruleRows.map(toRuleLike);
  const existing = await tx.notification.findMany({
    where: { batchId: { in: batches.map((b) => b.id) }, ruleId: { in: rules.map((r) => r.id) } },
    select: { batchId: true, ruleId: true },
  });
  const existingKeys = new Set(existing.map((n) => pairKey(n.batchId, n.ruleId)));

  const due = new Set<string>();
  const silenced: SyncResult['silenced'] = [];
  for (const batch of batches) {
    for (const rule of rules) {
      if (!isDue(rule, batch, now)) continue;
      const key = pairKey(batch.id, rule.id);
      due.add(key);
      if (!existingKeys.has(key)) silenced.push({ batchId: batch.id, ruleId: rule.id });
    }
  }

  const stale = existing.filter((n) => !due.has(pairKey(n.batchId, n.ruleId)));
  if (stale.length > 0) {
    await tx.notification.deleteMany({
      where: { OR: stale.map((n) => ({ batchId: n.batchId, ruleId: n.ruleId })) },
    });
  }
  if (silenced.length > 0) {
    await tx.notification.createMany({
      data: silenced.map((p) => ({ ...p, silent: true, sentAt: now })),
      skipDuplicates: true,
    });
  }
  return { silenced };
}
