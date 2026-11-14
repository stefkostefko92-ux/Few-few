import { errorMessage, logger } from '../logger.js';
import { kickOutbox } from '../mail/outbox.js';
import { runReminders } from '../documents/reminders.js';
import { runDueRecurring } from './run.js';

/**
 * Работникът на автоматизацията (на 10 минути и при старт): повтарящите се фактури с настъпила дата и
 * напомнянията за просрочени. Грешката само се записва — следващият път опитва пак.
 */
export function startAutomationLoop(): NodeJS.Timeout {
  const run = () => {
    runDueRecurring()
      .then((count) => {
        if (count > 0) logger.info({ count }, 'издадени повтарящи се фактури');
      })
      .catch((error: unknown) =>
        logger.error({ err: errorMessage(error) }, 'повтарящите се фактури не минаха'),
      )
      .then(() => runReminders())
      .then((count) => {
        if (count > 0) logger.info({ count }, 'изпратени напомняния');
      })
      .catch((error: unknown) =>
        logger.error({ err: errorMessage(error) }, 'напомнянията не минаха'),
      )
      .finally(() => kickOutbox());
  };
  run();
  const timer = setInterval(run, 10 * 60 * 1000);
  timer.unref();
  return timer;
}
