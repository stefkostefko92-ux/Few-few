import type { Role, Theme } from '@prisma/client';

/** Членство на вписания човек: активна фирма и ролята му в нея (никога MASTER). */
export interface MembershipView {
  aziendaId: string;
  aziendaName: string;
  role: Role;
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
  mustChangePassword: boolean;
}

export interface Principal {
  user: SessionUser;
  session: { id: string; csrfToken: string };
}
