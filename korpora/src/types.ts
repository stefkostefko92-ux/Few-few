import type { Plan, Role } from '@prisma/client';

/** Вписаният човек, както го виждат маршрутите и шаблоните. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: string;
  plan: Plan;
  planExpiresAt: Date | null;
  emailVerifiedAt: Date | null;
  totpEnabledAt: Date | null;
}

export interface Principal {
  user: SessionUser;
  session: { id: string; csrfToken: string; mfaPassed: boolean };
  sessionToken: string;
}
