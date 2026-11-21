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
const HOUR_MS = 60 * 60_000;

export function alertDue(input: {
  count: number;
  threshold: number;
  rule: string;
  key: string;
  now?: number;
  windowMs?: number;
}): boolean {
  if (input.count < input.threshold) return false;
  const now = input.now ?? Date.now();
  if (!rateLimit(`alert:${input.rule}:${input.key}`, 1, input.windowMs ?? HOUR_MS, now)) return false;
  return rateLimit(`alert:${input.rule}:global`, ALERT_RULE_CAP_PER_HOUR, HOUR_MS, now);
}
