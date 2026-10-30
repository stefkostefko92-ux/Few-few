import 'server-only';
import { monthlyPrice, stripeErrorOf, type MonthlyPrice } from './stripe';
import { log } from './log';

// The owner's monthly price for the public pages (the landing's price cards and /pricing). After Stripe failed to
// answer, both say "on request" for a minute before asking again: one clock for every public page, so an outage costs
// one call to Stripe and one warning in the log a minute, not one per visit and page. The price itself is cached by
// monthlyPrice(); the application's billing page asks Stripe directly.
const RETRY_MS = 60 * 1000;
let failedAt = 0;

/** The monthly price as Stripe has it now, or null (no Price yet, or Stripe did not answer in the last minute). */
export async function publicMonthlyPrice(): Promise<MonthlyPrice | null> {
  if (Date.now() - failedAt < RETRY_MS) return null;
  try {
    return await monthlyPrice();
  } catch (err) {
    failedAt = Date.now();
    log.warn({ err: stripeErrorOf(err) }, 'monthly price not read for the public pages');
    return null;
  }
}
