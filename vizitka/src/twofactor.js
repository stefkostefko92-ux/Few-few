// Проверка на втория фактор — общо за входа и за изключването на 2FA.
import db from './db.js';
import { decryptSecret, verifyTotp, hashRecoveryCode, normalizeRecoveryCode } from './totp.js';

/**
 * Проверява код от приложението ИЛИ резервен код. Връща 'totp', 'recovery' или null.
 * Успешният TOTP код записва стъпката си (не може да се ползва втори път), а
 * резервният се маркира като изразходван — и двете в една транзакция с проверката.
 */
export function verifySecondFactor(user, code) {
  if (!user?.totp_enabled) return null;
  const raw = String(code || '').trim();

  if (/^\d[\d\s]{5,7}$/.test(raw)) {
    const secret = decryptSecret(user.totp_secret);
    // Няма ключ/повреден шифротекст → ОТКАЗ (fail closed). Резервните кодове остават.
    if (!secret) return null;
    const step = verifyTotp(secret, raw, { lastStep: user.totp_last_step });
    if (step === null) return null;
    // Условният UPDATE е защитата от състезание: две паралелни заявки с един код —
    // само едната записва стъпката, другата вижда 0 променени реда.
    const r = db
      .prepare('UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?')
      .run(step, user.id, step);
    return r.changes === 1 ? 'totp' : null;
  }

  if (normalizeRecoveryCode(raw).length === 10) {
    const r = db
      .prepare(
        `UPDATE recovery_codes SET used_at = datetime('now')
          WHERE user_id = ? AND code_hash = ? AND used_at IS NULL`
      )
      .run(user.id, hashRecoveryCode(raw));
    return r.changes === 1 ? 'recovery' : null;
  }
  return null;
}

export const remainingRecoveryCodes = (userId) =>
  db
    .prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL')
    .get(userId).n;
