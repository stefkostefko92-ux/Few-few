// Вход с Discord, изход, проверка на сесията, правото за дашборда и CSRF.
import type { NextFunction, Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { canUseDashboard, type MemberFacts } from '../domain/access.js';
import { getSettings } from '../services/rules.js';
import { setContext, type WebKit } from './context.js';
import {
  cookieOptions,
  randomToken,
  safeEqual,
  sessionKey,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
  type SessionUser,
} from './session.js';

const MEMBER_CACHE_MS = 60_000;
const STATE_TTL_MS = 10 * 60_000;

const callbackSchema = z.object({
  code: z.string().min(1).max(200),
  state: z.string().min(1).max(100),
});

export interface AuthKit {
  router: Router;
  requireUser(req: Request, res: Response, next: NextFunction): Promise<void>;
  forgetMember(userId?: string): void;
}

export function createAuth(kit: WebKit): AuthKit {
  const { deps, names, secure } = kit;
  const key = sessionKey(deps.sessionSecret);
  const publicOrigin = new URL(deps.publicBaseUrl).origin;
  const members = new Map<string, { facts: MemberFacts | null; until: number }>();

  async function memberFacts(userId: string, fresh = false): Promise<MemberFacts | null> {
    const hit = members.get(userId);
    if (!fresh && hit && hit.until > Date.now()) return hit.facts;
    const facts = await deps.guild.memberFacts(userId);
    members.set(userId, { facts, until: Date.now() + MEMBER_CACHE_MS });
    return facts;
  }

  function denied(req: Request, res: Response): void {
    res.clearCookie(names.session, cookieOptions(secure, 0));
    kit.render(
      req,
      res,
      'message',
      {
        title: 'Нямаш достъп',
        text: 'Дашбордът е само за членове на сървъра с определената роля. Ако смяташ, че е грешка, пиши на администратор.',
      },
      403,
    );
  }

  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  const router = createRouter();

  router.get('/login', (req, res) => {
    kit.render(req, res, 'login', { title: 'Вход' });
  });

  router.get('/auth/discord', authLimiter, (_req, res) => {
    const state = randomToken();
    res.cookie(names.state, state, cookieOptions(secure, STATE_TTL_MS));
    res.redirect(302, deps.oauth.authorizeUrl(state));
  });

  router.get('/auth/callback', authLimiter, async (req, res) => {
    const expected: unknown = req.cookies?.[names.state];
    res.clearCookie(names.state, cookieOptions(secure, 0));
    const q = callbackSchema.safeParse(req.query);
    if (!q.success || typeof expected !== 'string' || !safeEqual(q.data.state, expected)) {
      kit.render(
        req,
        res,
        'message',
        {
          title: 'Входът не мина',
          text: 'Връзката за вход е невалидна или изтекла. Опитай пак от страницата за вход.',
        },
        400,
      );
      return;
    }
    let identity;
    try {
      identity = await deps.oauth.identify(q.data.code);
    } catch (err) {
      deps.log.warn({ err }, 'Discord OAuth не мина');
      kit.render(
        req,
        res,
        'message',
        {
          title: 'Входът не мина',
          text: 'Discord не потвърди входа. Опитай пак след малко.',
        },
        502,
      );
      return;
    }
    const settings = await getSettings(deps.db);
    if (!canUseDashboard(await memberFacts(identity.id, true), settings.dashboardRoleId)) {
      deps.log.info({ userId: identity.id }, 'отказан вход в дашборда');
      denied(req, res);
      return;
    }
    const token = await signSession(
      { sub: identity.id, name: identity.name, avatar: identity.avatarUrl },
      key,
    );
    res.cookie(names.session, token, cookieOptions(secure, SESSION_TTL_SECONDS * 1000));
    deps.log.info({ userId: identity.id }, 'вход в дашборда');
    res.redirect(302, '/');
  });

  // Сесия → CSRF (за POST) → правото, проверено наново (кеш 60 s). Ролята, махната в Discord, затваря
  // дашборда най-късно след минута, без да чака изтичането на сесията.
  async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token: unknown = req.cookies?.[names.session];
    const user: SessionUser | null =
      typeof token === 'string' ? await verifySession(token, key) : null;
    if (!user) {
      if (req.method === 'GET') res.redirect(302, '/login');
      else res.status(401).type('text/plain').send('Влез отново.');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.get('origin');
      const body: unknown = req.body;
      const sent =
        typeof body === 'object' && body !== null && '_csrf' in body ? body._csrf : undefined;
      if (
        (origin && origin !== publicOrigin) ||
        typeof sent !== 'string' ||
        !safeEqual(sent, user.csrf)
      ) {
        res.status(403).type('text/plain').send('Невалидна заявка (CSRF). Презареди страницата.');
        return;
      }
    }
    if (!deps.guild.ready()) {
      kit.render(
        req,
        res,
        'message',
        {
          title: 'Ботът се свързва',
          text: 'Ботът още се свързва с Discord. Опитай пак след няколко секунди.',
        },
        503,
      );
      return;
    }
    const settings = await getSettings(deps.db);
    if (!canUseDashboard(await memberFacts(user.sub), settings.dashboardRoleId)) {
      denied(req, res);
      return;
    }
    setContext(req, { user, settings });
    next();
  }

  router.post('/auth/logout', requireUser, (_req, res) => {
    res.clearCookie(names.session, cookieOptions(secure, 0));
    res.redirect(303, '/login');
  });

  return {
    router,
    requireUser,
    forgetMember(userId) {
      if (userId) members.delete(userId);
      else members.clear();
    },
  };
}
