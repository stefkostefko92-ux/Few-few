// Текстовете на бота: процент, оставащо време, известия и /infosemki — на български.
import type { AlertGroup, AlertKind, BatchLike, RuleLike } from './alerts.js';
import { seedCards, type SeedCard } from './cards.js';
import { expiresAt, msLeft, percentAt } from './decay.js';
import { healthOf, type HealthStage } from './health.js';

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

export function formatSeeds(n: number): string {
  return `${formatNumber(n)} ${n === 1 ? 'семка' : 'семки'}`;
}

export function formatBatches(n: number): string {
  return `${formatNumber(n)} ${n === 1 ? 'партида' : 'партиди'}`;
}

// Цветът на здравето като в „Партиди“ (зелено → жълто → оранжево → червено → кафяво, изтекла — черно).
const HEALTH_DOTS: Readonly<Record<HealthStage, string>> = {
  fresh: '🟢',
  healthy: '🟡',
  aging: '🟠',
  spoiling: '🔴',
  rotting: '🟤',
  dead: '⚫',
};

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

// Точката на здравето на партидата.
export function healthDot(batch: BatchLike, now: Date): string {
  const p = percentAt(batch, batch.rate, now);
  return HEALTH_DOTS[healthOf(p, msLeft(batch, batch.rate, now) <= 0).stage];
}

// Партидата като ред в „Партиди“: брой семки, здраве, процент, колко остава и кога изтича. Без номера —
// хората в канала гледат вида и броя, не номера.
export function batchStatus(batch: BatchLike, now: Date): string {
  const left = msLeft(batch, batch.rate, now);
  const p = percentAt(batch, batch.rate, now);
  const seeds = `**${formatSeeds(batch.count)}**`;
  const health = healthOf(p, left <= 0);
  if (left <= 0) return `${seeds} · ${health.label}`;
  const end = expiresAt(batch, batch.rate);
  return (
    `${seeds} · ${health.label} · **${formatPercent(p)}** · остават ${formatDuration(left)} · ` +
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
  // снимките под съобщението — по една за вид в тази част (src/domain/cards.ts)
  cards: SeedCard[];
}

export function buildAlertParts(group: AlertGroup, labels: SeedLabels, now: Date): AlertPart[] {
  const byBatch = new Map<number, { batch: BatchLike; rules: RuleLike[] }>();
  for (const { batch, rule } of group.items) {
    const entry = byBatch.get(batch.id) ?? { batch, rules: [] };
    entry.rules.push(rule);
    byBatch.set(batch.id, entry);
  }
  const parts: AlertPart[] = [];
  const header = group.message ?? '**Семките изтичат**';
  let current: AlertPart = { content: `<@&${group.roleId}> ${header}`, batchIds: [], cards: [] };
  for (const { batch, rules } of byBatch.values()) {
    const thresholds = rules.map((r) => formatThreshold(r.kind, r.threshold)).join(', ');
    const line =
      `${healthDot(batch, now)} **${seedLabel(labels, batch.seedTypeKey)}** · ${batchStatus(batch, now)} · праг ${thresholds}`.slice(
        0,
        MESSAGE_LIMIT - 100,
      );
    if (current.batchIds.length > 0 && current.content.length + 1 + line.length > MESSAGE_LIMIT) {
      parts.push(current);
      current = { content: line, batchIds: [batch.id], cards: [] };
    } else {
      current.content += `\n${line}`;
      current.batchIds.push(batch.id);
    }
  }
  if (current.batchIds.length > 0) parts.push(current);
  for (const part of parts) {
    const inPart = part.batchIds.flatMap((id) => byBatch.get(id)?.batch ?? []);
    part.cards = seedCards(inPart, labels, now);
  }
  return parts;
}

export function buildAlertMessages(group: AlertGroup, labels: SeedLabels, now: Date): string[] {
  return buildAlertParts(group, labels, now).map((p) => p.content);
}
