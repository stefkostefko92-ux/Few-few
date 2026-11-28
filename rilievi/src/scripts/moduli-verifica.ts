import { errorMessage, logger } from '../logger.js';
import { assertModuli, chiaveModuli, MODULI_TUTTI } from '../ordini/moduli.js';

/**
 * Проверката на шифрованите модули с новия образ, преди контейнерите да се сменят (deploy/deploy.sh,
 * `check_moduli`): с MODULI_KEY от .env всеки модул се отваря и е точно версията на картата си (SHA-256).
 * Иначе новият портал не би тръгнал — работещият остава непокътнат.
 */
try {
  if (!chiaveModuli()) throw new Error('липсва MODULI_KEY');
  assertModuli();
  logger.info({ moduli: MODULI_TUTTI.length }, 'модулите на доставчиците се отварят с MODULI_KEY');
} catch (error) {
  logger.error({ err: errorMessage(error) }, 'модулите на доставчиците не се отварят');
  process.exitCode = 1;
}
