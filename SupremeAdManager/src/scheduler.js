// Планировчик: на интервал синхронизира метрики и изпълнява правилата.
// Съзнателно прост (setInterval) — един процес, един собственик, нула зависимости.
import { config } from './config.js';
import { db, audit } from './db.js';
import { syncMetrics } from './insights.js';
import { runRules } from './rules.js';

let running = false;

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
    const cleaned = retentionCleanup();
    audit('scheduler', 'tick', { detail: { synced, fired: fired.length, cleaned } });
    return { synced, fired, cleaned };
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
