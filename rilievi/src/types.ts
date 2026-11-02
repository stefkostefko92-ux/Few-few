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
  nomiRuoli?: NomiRuoli;
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
}

export interface Principal {
  user: SessionUser;
  session: { id: string; csrfToken: string };
}
