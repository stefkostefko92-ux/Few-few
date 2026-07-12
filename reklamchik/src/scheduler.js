// Планировчик: на интервал синхронизира метрики и изпълнява правилата.
// Съзнателно прост (setInterval) — един процес, един собственик, нула зависимости.
import { config } from './config.js';
import { audit } from './db.js';
import { syncMetrics } from './insights.js';
import { runRules } from './rules.js';

let running = false;

export async function tick() {
  if (running) return { skipped: true }; // без припокриващи се цикли
  running = true;
  try {
    const synced = await syncMetrics();
    const fired = await runRules();
    audit('scheduler', 'tick', { detail: { synced, fired: fired.length } });
    return { synced, fired };
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
