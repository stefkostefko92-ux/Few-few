import type { Role, Theme } from '@prisma/client';

/** Вписаният човек, както го виждат маршрутите и шаблоните. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: string;
  theme: Theme;
  mustChangePassword: boolean;
  /** Фирмата на човека; null само за MASTER (собственика на портала), който вижда всички фирми. */
  aziendaId: string | null;
  aziendaName: string | null;
}

export interface Principal {
  user: SessionUser;
  session: { id: string; csrfToken: string };
}
