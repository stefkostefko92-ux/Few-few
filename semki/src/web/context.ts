// Общото между маршрутите: зависимостите, контекстът на заявката (WeakMap — без `any` в res.locals),
// флаш съобщенията и рендерът с общите полета.
import type { PrismaClient, Settings } from '@prisma/client';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { GuildDirectory } from '../discord/guild.js';
import type { Logger } from '../log.js';
import type { AlertSender } from '../services/notifier.js';
import type { OAuthClient } from './oauth.js';
import { cookieNames, cookieOptions, type CookieNames, type SessionUser } from './session.js';

export interface HealthStatus {
  db: boolean;
  discord: 'ready' | 'connecting';
}

export interface WebDeps {
  db: PrismaClient;
  guild: GuildDirectory;
  oauth: OAuthClient;
  sender: AlertSender;
  log: Logger;
  publicBaseUrl: string;
  sessionSecret: string;
  trustProxy: string;
  health(): Promise<HealthStatus>;
  now?: () => Date;
}

export interface RequestContext {
  user: SessionUser;
  settings: Settings;
}

const contexts = new WeakMap<Request, RequestContext>();

export function setContext(req: Request, ctx: RequestContext): void {
  contexts.set(req, ctx);
}

export function getContext(req: Request): RequestContext {
  const ctx = contexts.get(req);
  if (!ctx) throw new Error('маршрутът е без requireUser');
  return ctx;
}

const flashSchema = z.object({ t: z.enum(['ok', 'err']), m: z.string().max(300) });
export type Flash = z.output<typeof flashSchema>;

export class WebKit {
  readonly names: CookieNames;
  readonly secure: boolean;

  constructor(readonly deps: WebDeps) {
    this.secure = deps.publicBaseUrl.startsWith('https://');
    this.names = cookieNames(this.secure);
  }

  now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  flash(res: Response, t: Flash['t'], m: string): void {
    res.cookie(
      this.names.flash,
      JSON.stringify({ t, m: m.slice(0, 300) }),
      cookieOptions(this.secure, 60_000),
    );
  }

  takeFlash(req: Request, res: Response): Flash | null {
    const raw: unknown = req.cookies?.[this.names.flash];
    if (typeof raw !== 'string') return null;
    res.clearCookie(this.names.flash, cookieOptions(this.secure, 0));
    try {
      const parsed = flashSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  render(
    req: Request,
    res: Response,
    view: string,
    data: Record<string, unknown>,
    status = 200,
  ): void {
    const ctx = contexts.get(req);
    res.status(status).render(view, {
      user: ctx?.user ?? null,
      csrf: ctx?.user.csrf ?? '',
      flash: this.takeFlash(req, res),
      active: '',
      ...data,
    });
  }
}
