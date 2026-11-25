import { attemptFailed, attemptSucceeded, reserveAttempt } from '../auth/lockout.js';
import { verificaCodice, type UtenteDueFattori } from '../auth/codice.js';
import { verifyPassword } from '../auth/password.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { auditBlocco } from './login.js';

/**
 * Потвърждение в отворена сесия (смяна на паролата, включване и изключване на 2FA, нови резервни
 * кодове): паролата или кодът се броят в заключването като при входа — опитът се заема ПРЕДИ проверката,
 * затова паралелни заявки от една (може би открадната) сесия не получават повече опити. Заключи ли се
 * акаунтът от грешки тук, всички сесии на човека падат: отворената сесия не дава безкрайни опити.
 */
export type Reauth = 'wrong' | 'locked' | null;

async function reauth(userId: string, check: () => Promise<boolean>): Promise<Reauth> {
  const attempt = await reserveAttempt(userId);
  if (!attempt.reserved) {
    if (attempt.lockedNow) await bloccatoInSessione(userId);
    return 'locked';
  }
  if (await check()) {
    await attemptSucceeded(userId, false);
    return null;
  }
  const failure = await attemptFailed(userId);
  if (failure.lockedNow) await bloccatoInSessione(userId);
  return failure.locked ? 'locked' : 'wrong';
}

async function bloccatoInSessione(userId: string): Promise<void> {
  await destroyAllSessions(userId);
  await auditBlocco(userId);
}

export function reauthPassword(
  user: { id: string; passwordHash: string },
  password: string,
): Promise<Reauth> {
  return reauth(user.id, () => verifyPassword(password, user.passwordHash));
}

/** Код от приложението или резервен код (изразходва се). */
export function reauthCode(user: UtenteDueFattori, code: string): Promise<Reauth> {
  return reauth(user.id, async () => (await verificaCodice(user, code)) !== null);
}
