// Текстовете на бота: процент, оставащо време, известия и /infosemki — на български.
import type { AlertGroup, AlertKind, BatchLike, RuleLike } from './alerts.js';
import { expiresAt, msLeft, percentAt } from './decay.js';

export const MESSAGE_LIMIT = 2000;

export type SeedLabels = Readonly<Record<string, string>>;

const percentFormat = new Intl.NumberFormat('bg-BG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});
const numberFormat = new Intl.NumberFormat('bg-BG', {
  maximumFractionDigits: 2,
  useGrouping: false,
});

// До стотни: току-що въведените 87,4 се показват като 87,40%, не като 87,39%.
export function formatPercent(percent: number): string {
  return `${percentFormat.format(Math.round(percent * 100) / 100)}%`;
}

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0 мин';
  if (ms < 60_000) return '< 1 мин';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} д ${hours} ч ${minutes} мин`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

export function discordTime(date: Date, style: 'f' | 'R'): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

export function formatThreshold(kind: AlertKind, threshold: number): string {
  return kind === 'PERCENT'
    ? `≤ ${formatNumber(threshold)}%`
    : `≤ ${formatNumber(threshold)} ч до 0%`;
}

export function seedLabel(labels: SeedLabels, key: string): string {
  return labels[key] ?? key;
}

// Ред за една партида: брой, процент, оставащо време и кога изтича.
export function batchStatus(batch: BatchLike, now: Date): string {
  const left = msLeft(batch, batch.rate, now);
  const percent = formatPercent(percentAt(batch, batch.rate, now));
  if (left <= 0) return `×${batch.count} — **${percent}** · изтекла`;
  const end = expiresAt(batch, batch.rate);
  return (
    `×${batch.count} — **${percent}** · остават ${formatDuration(left)} · ` +
    `изтича ${discordTime(end, 'f')} (${discordTime(end, 'R')})`
  );
}

// Редове → съобщения до лимита на Discord; ред не се цепи.
export function chunkLines(lines: readonly string[], limit = MESSAGE_LIMIT): string[] {
  const parts: string[] = [];
  let current = '';
  for (const line of lines) {
    const piece = line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
    if (current && current.length + 1 + piece.length > limit) {
      parts.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// Една част = едно съобщение и партидите в него: при провал по средата се освобождават само
// неизпратените (иначе изпратените части се пингват пак).
export interface AlertPart {
  content: string;
  batchIds: number[];
}

export function buildAlertParts(group: AlertGroup, labels: SeedLabels, now: Date): AlertPart[] {
  const byBatch = new Map<number, { batch: BatchLike; rules: RuleLike[] }>();
  for (const { batch, rule } of group.items) {
    const entry = byBatch.get(batch.id) ?? { batch, rules: [] };
    entry.rules.push(rule);
    byBatch.set(batch.id, entry);
  }
  const parts: AlertPart[] = [];
  let current: AlertPart = { content: `<@&${group.roleId}> **Семките изтичат**`, batchIds: [] };
  for (const { batch, rules } of byBatch.values()) {
    const thresholds = rules.map((r) => formatThreshold(r.kind, r.threshold)).join(', ');
    const line =
      `• **${seedLabel(labels, batch.seedTypeKey)}** #${batch.id} ${batchStatus(batch, now)} · праг ${thresholds}`.slice(
        0,
        MESSAGE_LIMIT - 100,
      );
    if (current.batchIds.length > 0 && current.content.length + 1 + line.length > MESSAGE_LIMIT) {
      parts.push(current);
      current = { content: line, batchIds: [batch.id] };
    } else {
      current.content += `\n${line}`;
      current.batchIds.push(batch.id);
    }
  }
  if (current.batchIds.length > 0) parts.push(current);
  return parts;
}

export function buildAlertMessages(group: AlertGroup, labels: SeedLabels, now: Date): string[] {
  return buildAlertParts(group, labels, now).map((p) => p.content);
}

export function buildInfoMessages(
  batches: readonly BatchLike[],
  labels: SeedLabels,
  now: Date,
): string[] {
  if (batches.length === 0) return ['Няма въведени семки.'];
  const order = Object.keys(labels);
  const typeKeys = [...new Set(batches.map((b) => b.seedTypeKey))].sort(
    (a, b) => rank(order, a) - rank(order, b),
  );
  const total = batches.reduce((sum, b) => sum + b.count, 0);
  const lines = [`**Семки** — ${batches.length} партиди, ${total} бр.`];
  for (const key of typeKeys) {
    lines.push('', `**${seedLabel(labels, key)}**`);
    const ofType = batches
      .filter((b) => b.seedTypeKey === key)
      .sort((a, b) => expiresAt(a, a.rate).getTime() - expiresAt(b, b.rate).getTime());
    for (const b of ofType) lines.push(`#${b.id} ${batchStatus(b, now)}`);
  }
  return chunkLines(lines);
}

function rank(order: readonly string[], key: string): number {
  const i = order.indexOf(key);
  return i === -1 ? order.length : i;
}
