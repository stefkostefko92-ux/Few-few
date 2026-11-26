// Кои правила са дължими за коя партида, часовият прозорец и групирането на пинговете.
import { expiresAt, HOUR_MS, percentPerMs, type BatchAnchor, type DecayRate } from './decay.js';

export type AlertKind = 'PERCENT' | 'HOURS_LEFT';

export interface RuleLike {
  id: number;
  kind: AlertKind;
  threshold: number;
  seedTypeKey: string | null;
  channelId: string;
  roleId: string;
  enabled: boolean;
  repeatMinutes: number | null;
  message: string | null;
}

export interface BatchLike extends BatchAnchor {
  id: number;
  seedTypeKey: string;
  count: number;
  rate: DecayRate;
}

export interface QuietWindow {
  quietEnabled: boolean;
  windowStart: string;
  windowEnd: string;
  timezone: string;
}

export interface PendingItem {
  batch: BatchLike;
  rule: RuleLike;
}

export interface AlertGroup {
  channelId: string;
  roleId: string;
  message: string | null;
  items: PendingItem[];
}

export function pairKey(batchId: number, ruleId: number): string {
  return `${batchId}:${ruleId}`;
}

export function ruleApplies(rule: RuleLike, batch: BatchLike): boolean {
  return rule.enabled && (rule.seedTypeKey === null || rule.seedTypeKey === batch.seedTypeKey);
}

// Моментът, в който партидата минава прага на правилото (никога преди котвата).
export function crossingTime(rule: RuleLike, batch: BatchLike): Date {
  const anchor = batch.anchoredAt.getTime();
  let at: number;
  if (rule.kind === 'PERCENT') {
    at = anchor + (batch.percent - rule.threshold) / percentPerMs(batch.rate);
  } else {
    at = expiresAt(batch, batch.rate).getTime() - rule.threshold * HOUR_MS;
  }
  return new Date(Math.max(anchor, at));
}

export function isDue(rule: RuleLike, batch: BatchLike, now: Date): boolean {
  return ruleApplies(rule, batch) && now.getTime() >= crossingTime(rule, batch).getTime();
}

export function dueRuleIds(batch: BatchLike, rules: readonly RuleLike[], now: Date): number[] {
  return rules.filter((r) => isDue(r, batch, now)).map((r) => r.id);
}

// Минути от началото на деня в дадената часова зона (0–1439).
export function minutesOfDay(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function parseHhMm(value: string): number {
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m);
}

// Може ли да се пингва сега. Еднакви начало и край = цял ден; начало след края = през полунощ.
export function inWindow(now: Date, w: QuietWindow): boolean {
  if (!w.quietEnabled) return true;
  const start = parseHhMm(w.windowStart);
  const end = parseHhMm(w.windowEnd);
  if (start === end) return true;
  const t = minutesOfDay(now, w.timezone);
  return start < end ? t >= start && t < end : t >= start || t < end;
}

// Напомняне: правилото има интервал и от последния таг (или тихата отметка) е минал поне толкова.
export function repeatDue(rule: RuleLike, sentAt: Date, now: Date): boolean {
  return (
    rule.repeatMinutes !== null && now.getTime() - sentAt.getTime() >= rule.repeatMinutes * 60_000
  );
}

// Дължимите двойки (партида, правило): още неизвестени или чакащи напомняне (`notified` — кога е
// бил последният таг), събрани по канал, роля и съобщение.
export function planAlerts(
  batches: readonly BatchLike[],
  rules: readonly RuleLike[],
  notified: ReadonlyMap<string, Date>,
  now: Date,
): AlertGroup[] {
  const groups = new Map<string, AlertGroup>();
  for (const batch of batches) {
    for (const rule of rules) {
      if (!isDue(rule, batch, now)) continue;
      const sentAt = notified.get(pairKey(batch.id, rule.id));
      if (sentAt && !repeatDue(rule, sentAt, now)) continue;
      const key = `${rule.channelId}:${rule.roleId}:${rule.message ?? ''}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          channelId: rule.channelId,
          roleId: rule.roleId,
          message: rule.message,
          items: [],
        };
        groups.set(key, group);
      }
      group.items.push({ batch, rule });
    }
  }
  return [...groups.values()];
}
