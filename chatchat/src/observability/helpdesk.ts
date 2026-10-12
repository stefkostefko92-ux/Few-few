import {
  OUTBOX_RESULTS,
  type OutboxHooks,
  type OutboxSnapshot,
} from '../services/integrations/outbox-hooks.js';
import type { Metrics } from './catalog.js';

/**
 * Метриките на изпращача към helpdesk — куката, която IntegrationWorker вика (като `queueHooks` на
 * опашките): броячът по изход, gauge-ът по състояние и възрастта на най-старата чакаща доставка.
 * Етикетите са само кодове (`result`, `state`) — никога клиент, тикет или id.
 *
 * Възрастта се смята ПРИ ЧЕТЕНЕ от последната снимка: ако изпращачът спре да чете базата, тя
 * продължава да расте (алармата гори), вместо да замръзне на последната стойност.
 */

export function helpdeskHooks(metrics: Metrics, now: () => number = Date.now): OutboxHooks {
  // Броячите съществуват от старта с 0 — иначе първият dead-letter след рестарт е невидим за increase().
  for (const result of OUTBOX_RESULTS) metrics.helpdeskDeliveries.inc({ result }, 0);
  let oldest: Date | null = null;
  const gauge = metrics.helpdeskOldestPending;
  gauge.collect = () =>
    gauge.set(undefined, oldest ? Math.max(0, (now() - oldest.getTime()) / 1000) : 0);
  return {
    onResult: (result) => metrics.helpdeskDeliveries.inc({ result }),
    onSnapshot: (s: OutboxSnapshot) => {
      metrics.helpdeskOutbox.set({ state: 'pending' }, s.pending);
      metrics.helpdeskOutbox.set({ state: 'sending' }, s.sending);
      metrics.helpdeskOutbox.set({ state: 'dead' }, s.dead);
      oldest = s.oldestPendingAt;
      gauge.collect?.();
    },
  };
}
