import { RETENTION } from './content.js';

/**
 * Сроковете по CONTRACT.md §7 — изпълнява ги работникът (BullMQ, worker.ts):
 * `sessions` (с IP) — 30 дни · `kills` — 90 дни · обжалвания и доклади — 1 година след решение ·
 * картите на мачовете (`matches`, редовете им — каскадно) — 90 дни · дуелите (`duels`) — 90 дни.
 *
 * Трие се на партиди по първичен ключ: една огромна DELETE заявка държи заключване дълго, а
 * плъгинът пише в същите таблици всеки 10 s. Повторното пускане е безвредно (идемпотентно) —
 * каквото е изтрито, просто вече го няма.
 */
export const BATCH_SIZE = 5000;
/** Предпазител срещу безкраен цикъл, ако базата отговаря неочаквано (5000 × 2000 = 10 млн. реда). */
export const MAX_BATCHES = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PurgeTarget {
  id: 'sessions' | 'kills' | 'appeals' | 'reports' | 'matches' | 'duels';
  days: number;
}

export const PURGE_TARGETS: readonly PurgeTarget[] = [
  { id: 'sessions', days: RETENTION.sessionsDays },
  { id: 'kills', days: RETENTION.killsDays },
  { id: 'appeals', days: RETENTION.casesDays },
  { id: 'reports', days: RETENTION.casesDays },
  { id: 'matches', days: RETENTION.matchesDays },
  { id: 'duels', days: RETENTION.duelsDays },
];

export function cutoffFor(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** Изтрива една партида и връща колко реда е махнала. Реализацията е SQL (worker.ts). */
export type DeleteBatch = (
  target: PurgeTarget['id'],
  cutoff: Date,
  limit: number,
) => Promise<number>;

export interface PurgeResult {
  target: PurgeTarget['id'];
  cutoff: string;
  deleted: number;
  batches: number;
}

export async function purge(
  target: PurgeTarget,
  deleteBatch: DeleteBatch,
  now: Date,
  batchSize = BATCH_SIZE,
): Promise<PurgeResult> {
  const cutoff = cutoffFor(target.days, now);
  let deleted = 0;
  let batches = 0;
  while (batches < MAX_BATCHES) {
    const removed = await deleteBatch(target.id, cutoff, batchSize);
    batches += 1;
    deleted += removed;
    if (removed < batchSize) break;
  }
  return { target: target.id, cutoff: cutoff.toISOString(), deleted, batches };
}
