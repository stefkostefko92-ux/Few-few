import { errorMessage, logger } from '../logger.js';
import { reconcileCardPayments } from './card.js';
import { expireSubscriptions } from './expiry.js';

/**
 * Работникът на плащанията (на 10 минути): висящите плащания с карта (webhook-ът може да се изгуби) и
 * изтеклите платени периоди. Грешката само се записва — следващият път опитва пак.
 */
export function startBillingLoop(): NodeJS.Timeout {
  const run = () => {
    reconcileCardPayments()
      .then((count) => {
        if (count > 0) logger.info({ count }, 'активирани плащания с карта от проверката');
      })
      .catch((error: unknown) =>
        logger.error({ err: errorMessage(error) }, 'проверката на плащанията с карта не мина'),
      )
      .then(() => expireSubscriptions())
      .then((count) => {
        if (count > 0) logger.info({ count }, 'изтекли платени периоди');
      })
      .catch((error: unknown) =>
        logger.error({ err: errorMessage(error) }, 'изтичането на периодите не мина'),
      );
  };
  const timer = setInterval(run, 10 * 60 * 1000);
  timer.unref();
  return timer;
}
