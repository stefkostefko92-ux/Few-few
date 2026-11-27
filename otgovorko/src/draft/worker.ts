import { logger } from '../logger.js';
import { NO_AI } from '../tickets/classify.js';
import { purgeExpired } from '../tickets/retention.js';
import type { TicketStore } from '../tickets/types.js';
import { checkDraft } from './guard.js';
import type { DraftModel } from './model.js';
import { buildDraftRequest } from './prompt.js';

export const MAX_ATTEMPTS = 3;
export const VOICE_KEY = 'voice';

export interface WorkerDeps {
  store: TicketStore;
  /** null → няма Vertex проект: писмата чакат човек, без AI. */
  model: DraftModel | null;
  now: () => Date;
  canary: string;
  allowedDomains: string[];
  draftModel: string;
}

/**
 * Една стъпка на работника: взима най-стария нов билет и пише чернова. Не праща нищо — в този модул (и
 * в целия Отговорко) няма изпращач. Логовете са само с id и код — без адреси и текст.
 */
export async function draftOnce(d: WorkerDeps): Promise<'idle' | 'drafted' | 'failed' | 'skipped'> {
  const t = await d.store.claimNext(d.now());
  if (!t) return 'idle';
  if (NO_AI.has(t.cls) || !d.model) {
    await d.store.setStatus(t.id, t.cls === 'spam' ? 'closed' : 'needs_human');
    return 'skipped';
  }
  try {
    const [voice, samples] = await Promise.all([d.store.getSetting(VOICE_KEY), d.store.samples(5)]);
    const text = await d.model.complete(
      buildDraftRequest(t, {
        voice: voice ?? '',
        samples: samples.map((s) => s.text),
        canary: d.canary,
        model: d.draftModel,
      }),
    );
    const problems = checkDraft(text, {
      canary: d.canary,
      customer: t.from.address,
      allowedDomains: d.allowedDomains,
      samples: samples.map((s) => s.text),
    });
    if (problems.length) {
      logger.warn({ ticket: t.id, problems }, 'draft rejected');
      await d.store.failDraft(t.id, MAX_ATTEMPTS);
      return 'failed';
    }
    await d.store.setDraft(t.id, text, d.now());
    return 'drafted';
  } catch (err) {
    logger.warn(
      { ticket: t.id, kind: err instanceof Error ? err.name : 'unknown' },
      'draft failed',
    );
    await d.store.failDraft(t.id, MAX_ATTEMPTS);
    return 'failed';
  }
}

/** Цикълът: чернови на всеки 5 s (до 2 минути от писмото), изтриване по срока на всеки час. */
export function startWorker(d: WorkerDeps & { retentionDays: number }): () => void {
  let busy = false;
  const tick = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      while ((await draftOnce(d)) !== 'idle');
    } catch (err) {
      logger.error({ kind: err instanceof Error ? err.name : 'unknown' }, 'worker tick failed');
    } finally {
      busy = false;
    }
  };
  const purge = async (): Promise<void> => {
    try {
      const n = await purgeExpired(d.store, d.now(), d.retentionDays);
      if (n) logger.info({ deleted: n }, 'retention purge');
    } catch (err) {
      logger.error({ kind: err instanceof Error ? err.name : 'unknown' }, 'retention purge failed');
    }
  };
  const a = setInterval(() => void tick(), 5_000);
  const b = setInterval(() => void purge(), 3_600_000);
  void purge();
  return () => {
    clearInterval(a);
    clearInterval(b);
  };
}
