// Страницата „Дашборд“: всички семки на едно място — числата отгоре, графиката на трайността във
// времето, обобщението по видове и всички партиди по реда на изтичане.
import type { Request, Response } from 'express';
import { buildChart, seedColor } from '../domain/chart.js';
import { expiresAt, HOUR_MS, msLeft, percentAt } from '../domain/decay.js';
import { formatDuration, formatPercent } from '../domain/messages.js';
import { listBatches, listSeedTypes } from '../services/batches.js';
import { labelsOf } from '../services/mapping.js';
import { listRules } from '../services/rules.js';
import { getContext, type WebKit } from './context.js';
import { batchRows, dateTimeFormatter } from './viewmodels.js';

// Страницата се опреснява сама на 5 минути — процентите и оставащото време текат.
const REFRESH_SECONDS = 300;

export function dashboardPage(kit: WebKit) {
  return async (req: Request, res: Response): Promise<void> => {
    const { settings } = getContext(req);
    const db = kit.deps.db;
    const [types, batches, rules] = await Promise.all([
      listSeedTypes(db),
      listBatches(db),
      listRules(db),
    ]);
    const now = kit.now();
    const fmt = dateTimeFormatter(settings.timezone);
    const live = batches.filter((b) => msLeft(b, b.rate, now) > 0);

    const chart = buildChart({
      batches,
      labels: labelsOf(types),
      thresholds: rules.filter((r) => r.enabled && r.kind === 'PERCENT').map((r) => r.threshold),
      now,
      timezone: settings.timezone,
    });

    const expiry = new Map(batches.map((b) => [b.id, expiresAt(b, b.rate).getTime()]));
    const rows = batchRows(batches, types, now, settings.timezone)
      .sort((a, b) => (expiry.get(a.id) ?? 0) - (expiry.get(b.id) ?? 0))
      .map((r) => ({ ...r, color: seedColor(r.typeKey) }));

    const byType = types.map((t) => {
      const ofType = live.filter((b) => b.seedTypeKey === t.key);
      const soonest = ofType
        .map((b) => ({ b, left: msLeft(b, b.rate, now) }))
        .sort((x, y) => x.left - y.left)[0];
      return {
        key: t.key,
        label: t.label,
        color: seedColor(t.key),
        count: ofType.reduce((s, b) => s + b.count, 0),
        batches: ofType.length,
        lowest: soonest ? formatPercent(percentAt(soonest.b, soonest.b.rate, now)) : '—',
        soonest: soonest ? formatDuration(soonest.left) : '—',
      };
    });

    const next = live
      .map((b) => ({ b, left: msLeft(b, b.rate, now) }))
      .sort((x, y) => x.left - y.left)[0];

    kit.render(req, res, 'dashboard', {
      title: 'Дашборд',
      active: 'dashboard',
      refreshSeconds: REFRESH_SECONDS,
      timezone: settings.timezone,
      updatedText: fmt(now),
      chart,
      rows,
      byType,
      stats: {
        seeds: live.reduce((s, b) => s + b.count, 0),
        batches: live.length,
        soon: live.filter((b) => msLeft(b, b.rate, now) <= 24 * HOUR_MS).length,
        expired: chart.expired,
        nextText: next ? formatDuration(next.left) : '—',
        nextWho: next
          ? `#${next.b.id} ${types.find((t) => t.key === next.b.seedTypeKey)?.label ?? next.b.seedTypeKey}`
          : 'няма активни партиди',
      },
    });
  };
}
