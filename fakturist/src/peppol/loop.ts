import { errorMessage, logger } from '../logger.js';
import { accessPoint } from './settings.js';
import { sendDueTransmissions } from './transmissions.js';

/** Работникът на Peppol (на 2 мин и при старт): чакащите изпращания. Без настройки — нищо. */
export function startPeppolLoop(): NodeJS.Timeout {
  const run = () => {
    accessPoint()
      .then((ap) => sendDueTransmissions(ap))
      .then((count) => {
        if (count > 0) logger.info({ count }, 'изпратени през Peppol');
      })
      .catch((error: unknown) =>
        logger.error({ err: errorMessage(error) }, 'изпращането през Peppol не мина'),
      );
  };
  run();
  const timer = setInterval(run, 2 * 60 * 1000);
  timer.unref();
  return timer;
}
