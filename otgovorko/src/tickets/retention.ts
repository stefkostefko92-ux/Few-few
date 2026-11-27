import type { TicketStore } from './types.js';

const DAY_MS = 86_400_000;

/** Писмата се пазят `days` дни от получаването (SPEC §3), после се трият целите — с черновата. */
export function purgeExpired(store: TicketStore, now: Date, days: number): Promise<number> {
  return store.purgeBefore(new Date(now.getTime() - days * DAY_MS));
}
