import type { MemberRole, PlatformRole } from './auth/roles.js';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  locale: 'bg' | 'en';
  platformRole: PlatformRole;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  /** Имейлът е потвърден (връзка от писмо) — иначе приложението показва лента „Потвърдете имейла“. */
  emailVerified: boolean;
  memberships: Array<{ organizationId: string; role: MemberRole }>;
}

export interface Principal {
  user: SessionUser;
  sessionId: string;
  csrfToken: string;
  /** Минал ли е вторият фактор (или акаунтът няма 2FA). */
  verified: boolean;
}
