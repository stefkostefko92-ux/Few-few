import type { ApiKey, Role, Session, User } from '@prisma/client';
import type { Locale, Translator } from './i18n.js';

export interface HumanPrincipal {
  kind: 'human';
  user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'locale' | 'totpEnabledAt'>;
  session: Pick<Session, 'id' | 'csrfToken' | 'mfaPassed'>;
  sessionToken: string;
}

export interface AgentPrincipal {
  kind: 'agent';
  key: Pick<ApiKey, 'id' | 'name' | 'scopes' | 'brandIds'>;
}

declare global {
  namespace Express {
    interface Request {
      principal?: HumanPrincipal | AgentPrincipal;
      cspNonce?: string;
    }
    interface Locals {
      cspNonce: string;
      csrfToken: string;
      currentUser: HumanPrincipal['user'] | null;
      currentRole: Role | null;
      can: (capability: string) => boolean;
      flash: { kind: 'ok' | 'error' | 'info'; text: string } | null;
      /** Езикът на заявката и преводачът — слагат се от `attachLocale`. */
      locale: Locale;
      t: Translator;
    }
  }
}

export {};
