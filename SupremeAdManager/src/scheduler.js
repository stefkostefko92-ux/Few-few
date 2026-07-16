// Планировчик: на интервал синхронизира метрики и изпълнява правилата.
// Съзнателно прост (setInterval) — един процес, един собственик, нула зависимости.
import { config } from './config.js';
import { db, audit } from './db.js';
import { syncMetrics } from './insights.js';
import { runRules } from './rules.js';
import { detectAnomalies, monthlyPacing } from './intel.js';

let running = false;

// Интелигентен суип (intel.js): аномалии за вчера + месечен pacing. Само сигнали
// в одитната следа — никакви действия (действията са работа на правилата/човека).
// Дедупликация: един запис на (кампания, дата, метрика) / (дата) — LIKE по ключовете,
// които стоят в началото на detail_json (редът на ключовете е под наш контрол).
export function intelligenceSweep(now = new Date()) {
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  let anomalies = 0;
  const campaigns = db
    .prepare(`SELECT id FROM campaigns WHERE status IN ('active','paused','published')`)
    .all();
  for (const c of campaigns) {
    for (const a of detectAnomalies(c.id, yesterday)) {
      const dup = db
        .prepare(
          `SELECT 1 FROM audit_log WHERE action='anomaly' AND campaign_id=? AND detail_json LIKE ? LIMIT 1`
        )
        .get(c.id, `{"date":"${yesterday}","metric":"${a.metric}"%`);
      if (dup) continue;
      audit('intel', 'anomaly', { campaignId: c.id, detail: { date: yesterday, ...a } });
      anomalies++;
    }
  }

  const pacing = monthlyPacing(config.guards.monthlyBudget, now);
  if (pacing?.over) {
    const today = now.toISOString().slice(0, 10);
    const dup = db
      .prepare(`SELECT 1 FROM audit_log WHERE action='pacing_alert' AND detail_json LIKE ? LIMIT 1`)
      .get(`{"date":"${today}"%`);
    if (!dup) {
      audit('intel', 'pacing_alert', {
        detail: {
          date: today,
          spent: pacing.spent,
          targetToDate: pacing.targetToDate,
          deviationPct: pacing.deviationPct,
        },
      });
    }
  }
  return { anomalies, pacingOver: Boolean(pacing?.over) };
}

// GDPR чл. 5(1)(д) — ограничение на съхранението: одит 24 месеца, метрики 25 месеца
// (стига за годишни сравнения; платформите така или иначе пазят повече при себе си).
export function retentionCleanup() {
  const audits = db
    .prepare(`DELETE FROM audit_log WHERE at < datetime('now', '-24 months')`)
    .run().changes;
  const metrics = db
    .prepare(`DELETE FROM metrics_daily WHERE date < date('now', '-25 months')`)
    .run().changes;
  return { audits, metrics };
}

export async function tick() {
  if (running) return { skipped: true }; // без припокриващи се цикли
  running = true;
  try {
    const synced = await syncMetrics();
    const fired = await runRules();
    const intel = intelligenceSweep();
    const cleaned = retentionCleanup();
    audit('scheduler', 'tick', { detail: { synced, fired: fired.length, intel, cleaned } });
    return { synced, fired, intel, cleaned };
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (!config.scheduler.enabled) return null;
  const ms = Math.max(5, config.scheduler.intervalMinutes) * 60 * 1000;
  const timer = setInterval(() => {
    tick().catch((err) =>
      audit('scheduler', 'tick_error', { detail: { error: String(err.message) } })
    );
  }, ms);
  timer.unref?.();
  return timer;
}
