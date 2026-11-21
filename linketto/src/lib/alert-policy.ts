// Кога детекционно правило праща аларма до админите (Стражата B1, Разбивача F4).
// Чиста логика върху лимитера в паметта — тества се без база и поща.
//
// - Праг: count >= threshold. С `===` паралелни заявки (19 → 21) прескачат
//   прага, а постоянен поток над него ослепява правилото завинаги.
// - Веднъж на прозорец за правило+ключ: потокът над прага не залива пощата,
//   но в следващия прозорец алармата идва пак.
// - Общ таван на правило: въртене на ключове (различни имейли/IP) не изчерпва
//   квотата на Brevo (безплатният план е 300 писма/ден за ВСИЧКИ писма).

import { rateLimit } from '@/lib/limiter';

export const ALERT_RULE_CAP_PER_HOUR = 6;
// Общ бюджет за правилата, които ВЪНШЕН човек може да задейства (неуспешни
// входове, грешен подпис на уебхука) — сумата по всички тях, не по правило
// (Стражата B1: 4 правила × 6/ч × A админа > 300 писма/ден на Brevo free).
// Алармите за админ вход, 2FA, step-up и спорове са извън този бюджет.
export const OUTSIDER_ALERTS_PER_HOUR = 2;
export const OUTSIDER_ALERTS_PER_DAY = 12;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

export function alertDue(input: {
  count: number;
  threshold: number;
  rule: string;
  key: string;
  now?: number;
  windowMs?: number;
  /** Правилото се задейства от външен човек → и общият бюджет на външните. */
  outsider?: boolean;
}): boolean {
  if (input.count < input.threshold) return false;
  const now = input.now ?? Date.now();
  if (!rateLimit(`alert:${input.rule}:${input.key}`, 1, input.windowMs ?? HOUR_MS, now)) return false;
  if (!rateLimit(`alert:${input.rule}:global`, ALERT_RULE_CAP_PER_HOUR, HOUR_MS, now)) return false;
  if (!input.outsider) return true;
  return (
    rateLimit('alert:outsider:hour:global', OUTSIDER_ALERTS_PER_HOUR, HOUR_MS, now) &&
    rateLimit('alert:outsider:day:global', OUTSIDER_ALERTS_PER_DAY, DAY_MS, now)
  );
}
