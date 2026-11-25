import { prisma } from '../db.js';
import { revolutSettings } from '../admin/integrations.js';
import { errorMessage, logger } from '../logger.js';
import {
  DISPUTE_AUDIT_ACTION,
  DISPUTE_RECHECK_WINDOW_MS,
  recordRevolutDispute,
} from './disputes.js';
import { listOpenRevolutDisputes, RevolutError, type FetchLike } from './revolut-client.js';

/** Най-много толкова нови спора на обиколка (всеки е заявка към Revolut). */
const POLL_BATCH = 20;

/**
 * Откритите спорове при Revolut, които нямат запис при нас (Продавача, 25.11.2026): уебхукът `DISPUTE_*` може
 * да се изгуби (сменена тайна, недостъпен сървър) — тогава няма и „непрочетен“ запис, който
 * `recheckUnreadDisputes` да опита пак, а срокът за отговор тече. Работникът на плащанията (на 10 мин) пита
 * списъка с „нужен е отговор“ за последните 30 дни; всеки нов минава през `recordRevolutDispute` (запис в
 * одита + писмо до мастърите). Само в продукция — в sandbox Revolut не дава споровете. Връща колко нови
 * спора е записал.
 */
export async function pollOpenDisputes(
  fetchImpl: FetchLike = fetch,
  now = new Date(),
  batch = POLL_BATCH,
): Promise<number> {
  if ((await revolutSettings()).environment !== 'production') return 0;
  let ids: string[];
  try {
    ids = await listOpenRevolutDisputes(
      new Date(now.getTime() - DISPUTE_RECHECK_WINDOW_MS),
      fetchImpl,
    );
  } catch (error) {
    if (error instanceof RevolutError && error.code === 'notConfigured') return 0;
    throw error;
  }
  if (ids.length === 0) return 0;
  const known = await prisma.auditLog.findMany({
    where: { action: DISPUTE_AUDIT_ACTION, targetType: 'RevolutDispute', targetId: { in: ids } },
    select: { targetId: true },
    distinct: ['targetId'],
  });
  const seen = new Set(known.map((row) => row.targetId));
  let recorded = 0;
  for (const disputeId of ids.filter((id) => !seen.has(id)).slice(0, batch)) {
    try {
      if (
        (await recordRevolutDispute(disputeId, 'DISPUTE_ACTION_REQUIRED', fetchImpl)) === 'recorded'
      ) {
        recorded += 1;
      }
    } catch (error) {
      // Непрочетеният спор вече има запис „не се прочете“ — `recheckUnreadDisputes` го опитва пак.
      logger.warn({ err: errorMessage(error) }, 'открит спор при Revolut не се прочете');
    }
  }
  return recorded;
}
