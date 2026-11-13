import type { SessionUser } from '../types.js';
import { condizioniValide, VERSIONE } from './versioni.js';

/** Какво още трябва да приеме вписаният човек, преди да ползва портала. */
export interface DaAccettare {
  /**
   * Условията за услугата на фирма с неприета текуща версия: `accetta` — той е неин ADMIN и ги приема за
   * нея; `attendi` — чака администратора ѝ; null — всичките му фирми са ги приели.
   */
  condizioni: 'accetta' | 'attendi' | null;
  /** Фирмата, за която се отнася `condizioni` (null, когато няма какво). */
  azienda: { id: string; name: string } | null;
  /** Правилата за ползване в текущата версия — още не ги е приел. */
  regole: boolean;
}

export type UtenteAccettazioni = Pick<SessionUser, 'master' | 'memberships' | 'regoleVersione'>;

/**
 * Състоянието на приемането. MASTER (Carbon Stealth) не приема нищо — той е доставчикът. Условията на
 * фирма приема само неин ADMIN; човек в няколко фирми първо приема там, където е ADMIN. Докато някоя от
 * фирмите му е без условия, порталът е затворен за него изцяло (нищо не се ползва без договор); правилата —
 * всеки сам.
 */
export function daAccettare(user: UtenteAccettazioni): DaAccettare {
  if (user.master) return { condizioni: null, azienda: null, regole: false };
  // Свършилата фирма (само износ) не приема нищо: договорът ѝ е приключил.
  const vive = user.memberships.filter((m) => !m.soloEsportazione);
  const pendenti = vive.filter((m) => !condizioniValide(m.condizioniVersione));
  const propria = pendenti.find((m) => m.role === 'ADMIN');
  const scelta = propria ?? pendenti[0];
  return {
    condizioni: propria ? 'accetta' : scelta ? 'attendi' : null,
    azienda: scelta ? { id: scelta.aziendaId, name: scelta.aziendaName } : null,
    regole: vive.length > 0 && user.regoleVersione !== VERSIONE.REGOLE,
  };
}

/** Има ли нещо неприето — тогава порталът отваря само страницата за приемане. */
export const inAttesa = (stato: DaAccettare): boolean => stato.condizioni !== null || stato.regole;
