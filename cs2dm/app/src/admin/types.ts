import type { PrismaClient, Role } from '@prisma/client';
import type { Locale } from '../i18n.js';
import type { AdminLiveSource } from '../live.js';
import type { CommandSender } from './commands.js';
import type { FetchLike } from './steam-openid.js';

/** Вписаният човек в панела — от `web_sessions` + `players`, прочетен наново на всяка заявка. */
export interface AdminPrincipal {
  sessionId: string;
  steamId: string;
  name: string;
  role: Role;
  csrf: string;
  mfaPassed: boolean;
  totpEnabled: boolean;
  lang: Locale;
  createdAt: Date;
}

/** Всичко, от което зависи панелът — подава се отвън, за да се тества без мрежа. */
export interface AdminDeps {
  db: PrismaClient;
  live: AdminLiveSource;
  bridge: CommandSender;
  agent: CommandSender;
  /** fetch към Steam (тестовете подават двойник — нула заявки към Steam). */
  steamFetch?: FetchLike;
  now?: () => Date;
  /** Тавани на заявките на IP (тестовете ги вдигат). */
  limits?: { login: number; mfa: number; post: number };
}

declare global {
  namespace Express {
    interface Locals {
      admin?: AdminPrincipal;
    }
  }
}
