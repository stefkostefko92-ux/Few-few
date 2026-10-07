import { createHash } from 'node:crypto';
import { logger } from '../logger.js';

const RANGE_API = 'https://api.pwnedpasswords.com/range/';

/**
 * Проверка в базата на Have I Been Pwned по k-анонимност: към услугата отиват само първите 5 знака
 * от SHA-1 хеша, никога паролата или целият хеш. `Add-Padding` скрива и размера на отговора.
 * Връща true/false, а при недостъпна услуга — null (регистрацията не спира; логва се предупреждение).
 */
export async function isBreachedPassword(password: string): Promise<boolean | null> {
  const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const res = await fetch(RANGE_API + prefix, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Rendetto-password-check' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'проверката за изтекли пароли върна грешка');
      return null;
    }
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.name : typeof error },
      'проверката за изтекли пароли е недостъпна',
    );
    return null;
  }
}
