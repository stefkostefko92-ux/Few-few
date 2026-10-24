/**
 * Генерира `ADMIN_PASSWORD_HASH` за `.env` на сървъра.
 * Паролата НЕ се пази никъде — само солта и scrypt хешът.
 *
 *   npm run admin:hash -- "моята дълга парола"
 */
import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Дай парола като аргумент, поне 12 знака.');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
// БЕЗ кавички НАРОЧНО. Пейстнат в `.env`, редът с кавички стига до
// приложението С тях (`env_file` на Compose не ги маха), `split(':')` се чупи
// и вярната парола дава „Грешна парола“ завинаги. Възпроизведено.
console.log(`ADMIN_PASSWORD_HASH=${salt}:${hash}`);
