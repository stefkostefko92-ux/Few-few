// Редовете от Prisma → типовете на чистия домейн.
import type { AlertRule, Batch, SeedType } from '@prisma/client';
import type { BatchLike, RuleLike } from '../domain/alerts.js';

export type BatchWithType = Batch & { seedType: SeedType };

export interface BatchView extends BatchLike {
  createdAt: Date;
  createdByName: string;
  source: string;
}

export function toBatchLike(row: BatchWithType): BatchView {
  return {
    id: row.id,
    seedTypeKey: row.seedTypeKey,
    count: row.count,
    percent: row.percent,
    anchoredAt: row.anchoredAt,
    rate: { decayPercent: row.seedType.decayPercent, decayMinutes: row.seedType.decayMinutes },
    createdAt: row.createdAt,
    createdByName: row.createdByName,
    source: row.source,
  };
}

export function toRuleLike(row: AlertRule): RuleLike {
  return {
    id: row.id,
    kind: row.kind,
    threshold: row.threshold,
    seedTypeKey: row.seedTypeKey,
    channelId: row.channelId,
    roleId: row.roleId,
    enabled: row.enabled,
    repeatMinutes: row.repeatMinutes,
    message: row.message,
  };
}

export function labelsOf(types: readonly SeedType[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const t of [...types].sort((a, b) => a.sortOrder - b.sortOrder)) labels[t.key] = t.label;
  return labels;
}
