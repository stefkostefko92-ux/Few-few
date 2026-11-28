import { errorMessage, logger } from '../logger.js';
import { reconcileCardPayments } from './card.js';
import { recheckUnreadDisputes } from './disputes.js';
import { pollOpenDisputes } from './dispute-poll.js';
import { expireSubscriptions } from './expiry.js';

/**
 * Работникът на плащанията (на 10 минути): висящите плащания с карта (webhook-ът може да се изгуби),
 * споровете, които още не са прочетени от Revolut (disputes.ts), откритите спорове без уебхук
 * (dispute-poll.ts) и изтеклите платени периоди. Грешката
 * само се записва — следващият път опитва пак.
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
      .then(() => recheckUnreadDisputes())
      .catch((error: unknown) =>
        logger.error({ err: errorMessage(error) }, 'повторното четене на споровете не мина'),
      )
      .then(() => pollOpenDisputes())
      .then((count) => {
        if (count > 0) logger.warn({ count }, 'открити спорове без уебхук — записани');
      })
      .catch((error: unknown) =>
        logger.error({ err: errorMessage(error) }, 'проверката за открити спорове не мина'),
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
