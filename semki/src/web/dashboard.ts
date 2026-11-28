// Главната страница — дашбордът: в едно изречение какво става, бързо добавяне на партида, семената по
// видове (3D, свежи → гниещи по трайността) и прогнозата във времето.
import type { Request, Response } from 'express';
import { buildChart } from '../domain/chart.js';
import { HOUR_MS, msLeft } from '../domain/decay.js';
import { HEALTH_LEGEND } from '../domain/health.js';
import { safeJson } from '../domain/json.js';
import { formatDuration } from '../domain/messages.js';
import { buildGroups, nextCrossing, sceneOf } from '../domain/tiles.js';
import { listBatches, listSeedTypes } from '../services/batches.js';
import { labelsOf, toRuleLike } from '../services/mapping.js';
import { listRules } from '../services/rules.js';
import { swatchKey } from '../domain/chart.js';
import { getContext, type WebKit } from './context.js';
import { dateTimeFormatter } from './viewmodels.js';

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
    const labels = labelsOf(types);
    const label = (key: string) => labels[key] ?? key;

    const thresholds = rules
      .filter((r) => r.enabled && r.kind === 'PERCENT')
      .map((r) => r.threshold);
    const chart = buildChart({ batches, labels, thresholds, now, timezone: settings.timezone });
    const { groups, empty } = buildGroups({
      batches,
      types: types.map((t) => ({ key: t.key, label: t.label })),
      thresholds,
      now,
      timezone: settings.timezone,
    });

    const first = live
      .map((b) => ({ b, left: msLeft(b, b.rate, now) }))
      .sort((x, y) => x.left - y.left)[0];
    const crossing = nextCrossing(batches, rules.map(toRuleLike), now);

    kit.render(req, res, 'dashboard', {
      title: 'Дашборд',
      active: 'dashboard',
      pageCss: ['dashboard.css', 'tiles.css', 'chart.css'],
      pageJs: 'js/dashboard.js',
      timezone: settings.timezone,
      updatedText: fmt(now),
      chart,
      groups,
      empty,
      legend: HEALTH_LEGEND,
      // легендата показва вида на първия рафт (видовете се различават на вид)
      sceneJson: safeJson({
        tiles: sceneOf(groups),
        legend: HEALTH_LEGEND,
        legendType: groups[0]?.key ?? 'amnesia',
      }),
      hasRules: rules.some((r) => r.enabled),
      types: types.map((t) => ({ key: t.key, label: t.label, swatch: swatchKey(t.key) })),
      stats: {
        seeds: live.reduce((s, b) => s + b.count, 0),
        batches: live.length,
        soon: live.filter((b) => msLeft(b, b.rate, now) <= 24 * HOUR_MS).length,
        expired: batches.length - live.length,
      },
      first: first
        ? {
            id: first.b.id,
            label: label(first.b.seedTypeKey),
            leftText: formatDuration(first.left),
            urgent: first.left <= 24 * HOUR_MS,
          }
        : null,
      crossing: crossing
        ? {
            id: crossing.batchId,
            label: label(crossing.seedTypeKey),
            thresholdText: crossing.thresholdText,
            inText: formatDuration(crossing.at.getTime() - now.getTime()),
            atText: fmt(crossing.at),
          }
        : null,
    });
  };
}
