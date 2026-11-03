// Данните за шаблоните: всичко е вече форматирано, шаблонът само показва.
import type { AlertRule, SeedType } from '@prisma/client';
import { expiresAt, msLeft, percentAt } from '../domain/decay.js';
import {
  formatDuration,
  formatNumber,
  formatPercent,
  formatThreshold,
} from '../domain/messages.js';
import type { GuildItem } from '../discord/guild.js';
import type { BatchView } from '../services/mapping.js';

export function dateTimeFormatter(timezone: string): (d: Date) => string {
  const f = new Intl.DateTimeFormat('bg-BG', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return (d) => f.format(d);
}

export interface BatchRowView {
  id: number;
  typeKey: string;
  typeLabel: string;
  count: number;
  percent: number;
  percentText: string;
  percentInput: string;
  leftText: string;
  expiresText: string;
  expired: boolean;
  level: 'ok' | 'warn' | 'low';
  createdByName: string;
  createdText: string;
  sourceText: string;
}

export function batchRows(
  batches: readonly BatchView[],
  types: readonly SeedType[],
  now: Date,
  timezone: string,
): BatchRowView[] {
  const fmt = dateTimeFormatter(timezone);
  const order = new Map(types.map((t) => [t.key, t.sortOrder]));
  const labels = new Map(types.map((t) => [t.key, t.label]));
  return [...batches]
    .sort(
      (a, b) =>
        (order.get(a.seedTypeKey) ?? 99) - (order.get(b.seedTypeKey) ?? 99) ||
        expiresAt(a, a.rate).getTime() - expiresAt(b, b.rate).getTime(),
    )
    .map((b) => {
      const p = percentAt(b, b.rate, now);
      const left = msLeft(b, b.rate, now);
      return {
        id: b.id,
        typeKey: b.seedTypeKey,
        typeLabel: labels.get(b.seedTypeKey) ?? b.seedTypeKey,
        count: b.count,
        percent: p,
        percentText: formatPercent(p),
        percentInput: (Math.round(p * 100) / 100).toFixed(2),
        leftText: left > 0 ? formatDuration(left) : 'изтекла',
        expiresText: fmt(expiresAt(b, b.rate)),
        expired: left <= 0,
        level: p > 30 ? 'ok' : p > 10 ? 'warn' : 'low',
        createdByName: b.createdByName,
        createdText: fmt(b.createdAt),
        sourceText: b.source === 'command' ? 'команда' : 'дашборд',
      };
    });
}

export interface SeedTypeView {
  key: string;
  label: string;
  decayPercentInput: string;
  decayMinutes: number;
  rateText: string;
  fullText: string;
  totalCount: number;
  batchCount: number;
}

export function seedTypeViews(
  types: readonly SeedType[],
  batches: readonly BatchView[],
): SeedTypeView[] {
  return types.map((t) => {
    const ofType = batches.filter((b) => b.seedTypeKey === t.key);
    const fullMs = (100 / t.decayPercent) * t.decayMinutes * 60_000;
    return {
      key: t.key,
      label: t.label,
      decayPercentInput: String(t.decayPercent),
      decayMinutes: t.decayMinutes,
      rateText: `${formatNumber(t.decayPercent)}% на ${t.decayMinutes} мин`,
      fullText: `100% → 0% за ${formatDuration(fullMs)}`,
      totalCount: ofType.reduce((s, b) => s + b.count, 0),
      batchCount: ofType.length,
    };
  });
}

export interface RuleView {
  id: number;
  kind: AlertRule['kind'];
  kindText: string;
  thresholdInput: string;
  thresholdText: string;
  seedTypeKey: string;
  seedText: string;
  channelId: string;
  channelName: string;
  channelKnown: boolean;
  channelUsable: boolean;
  roleId: string;
  roleName: string;
  roleKnown: boolean;
  roleUsable: boolean;
  enabled: boolean;
}

export function ruleViews(
  rules: readonly AlertRule[],
  types: readonly SeedType[],
  channels: readonly GuildItem[],
  roles: readonly GuildItem[],
): RuleView[] {
  const labels = new Map(types.map((t) => [t.key, t.label]));
  return rules.map((r) => {
    const channel = channels.find((c) => c.id === r.channelId);
    const role = roles.find((x) => x.id === r.roleId);
    return {
      id: r.id,
      kind: r.kind,
      kindText: r.kind === 'PERCENT' ? 'Праг в %' : 'Оставащо време',
      thresholdInput: String(r.threshold),
      thresholdText: formatThreshold(r.kind, r.threshold),
      seedTypeKey: r.seedTypeKey ?? '',
      seedText: r.seedTypeKey ? (labels.get(r.seedTypeKey) ?? r.seedTypeKey) : 'Всички видове',
      channelId: r.channelId,
      channelName: channel?.name ?? `непознат канал (${r.channelId})`,
      channelKnown: channel !== undefined,
      channelUsable: channel?.usable ?? false,
      roleId: r.roleId,
      roleName: role?.name ?? `непозната роля (${r.roleId})`,
      roleKnown: role !== undefined,
      roleUsable: role?.usable ?? false,
      enabled: r.enabled,
    };
  });
}
