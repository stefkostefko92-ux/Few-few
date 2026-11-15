import type { Role, Theme } from '@prisma/client';
import type { NomiRuoli, PermessiRuoli } from './auth/permessi.js';
import type { Colori } from './http/colori.js';

/**
 * Членство на вписания човек: активна фирма и ролята му в нея (никога MASTER), с правата и имената на
 * ролите, които фирмата е записала (src/auth/permessi.ts; липсващото — по подразбиране).
 */
export interface MembershipView {
  aziendaId: string;
  aziendaName: string;
  role: Role;
  permessi?: PermessiRuoli;
  /** Версията на условията за услугата, приети за фирмата (src/legale/); друга или липсваща — неприети. */
  condizioniVersione?: string | null;
  nomiRuoli?: NomiRuoli;
  /**
   * Фирмата е деактивирана (краят на услугата) и човекът е неин ADMIN: 90 дни влиза само за износа —
   * никаква способност в нея (auth/scope.ts), нищо за приемане (legale/stato.ts).
   */
  soloEsportazione?: true;
  /** MASTER е включил офертите на фирмата (src/preventivi/) — без това `preventivi:*` не важи в нея. */
  preventivi?: true;
  /** Краят на абонамента или на пробния месец (src/abbonamenti/); няма го — без срок. */
  abbonamentoFino?: Date;
  abbonamentoProva?: true;
  /** Абонаментът е изтекъл: във фирмата остава само четенето (auth/scope.ts). */
  solaLettura?: true;
}

/** Вписаният човек, както го виждат маршрутите и шаблоните. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** Собственикът на портала: всички фирми, без членства. */
  master: boolean;
  /** Активните фирми на човека с ролята му във всяка, по име. Празно само за MASTER. */
  memberships: MembershipView[];
  theme: Theme;
  /** Цветовете на темата „Personalizzato“ (src/http/colori.ts); null — няма свои. */
  colori: Colori | null;
  mustChangePassword: boolean;
  /** Докога е прочел новините на портала (src/novita/) — прозорецът показва по-новите. */
  novitaLetteAt?: Date;
  /** Версията на правилата за ползване, които е приел (src/legale/); друга или липсваща — неприети. */
  regoleVersione?: string | null;
}

export interface Principal {
  user: SessionUser;
  session: { id: string; csrfToken: string };
}
