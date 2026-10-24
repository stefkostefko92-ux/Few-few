import type { Request, Response } from 'express';
import { config } from '../config.js';
import { formattersFor } from '../format.js';
import { localeFromHeader, translatorFor, type Locale } from '../i18n.js';
import { logger } from '../logger.js';
import { withQuery } from '../seo.js';
import { asset } from '../view.js';
import { RESULTS, resultParam } from './forms.js';
import { CAPABILITIES, ROLE_LEVEL, can, type Capability } from './rbac.js';

/** Разделите на панела в реда на менюто — всеки с възможността, която го отваря. */
export const ADMIN_NAV: ReadonlyArray<{ id: string; href: string; cap: Capability }> = [
  { id: 'dashboard', href: '/admin', cap: 'panel' },
  { id: 'punishments', href: '/admin/punishments', cap: 'panel' },
  { id: 'players', href: '/admin/players', cap: 'panel' },
  { id: 'reports', href: '/admin/reports', cap: 'panel' },
  { id: 'appeals', href: '/admin/appeals', cap: 'appeals' },
  { id: 'vip', href: '/admin/vip', cap: 'vip' },
  { id: 'server', href: '/admin/server', cap: 'serverRead' },
  { id: 'settings', href: '/admin/settings', cap: 'settings' },
  { id: 'banners', href: '/admin/banners', cap: 'banners' },
  { id: 'audit', href: '/admin/audit', cap: 'audit' },
];

export function adminLocale(req: Request, res: Response): Locale {
  return res.locals.admin?.lang ?? localeFromHeader(req.get('accept-language'));
}

/**
 * Рендира изглед на панела с общите стойности: речник, формати, вписания човек, CSRF, менюто
 * (само разделите, които ролята отваря) и резултата от предишното действие (`?r=`).
 */
export function renderAdmin(
  req: Request,
  res: Response,
  view: string,
  data: Record<string, unknown> = {},
  status = 200,
): void {
  const locale = adminLocale(req, res);
  const t = translatorFor(locale);
  const principal = res.locals.admin ?? null;
  const fullAccess = principal !== null && principal.mfaPassed && principal.totpEnabled;
  const result = resultParam.parse(req.query.r);
  const locals = {
    locale,
    t,
    fmt: formattersFor(locale, config().DISPLAY_TZ),
    asset,
    me: principal,
    csrf: principal?.csrf ?? '',
    nav: fullAccess ? ADMIN_NAV.filter((item) => can(principal.role, item.cap)) : [],
    current: '',
    can: (cap: Capability) => fullAccess && can(principal.role, cap),
    capabilities: CAPABILITIES,
    roleLevel: ROLE_LEVEL,
    result: result ? { code: result, kind: RESULTS[result] } : null,
    path: req.originalUrl.split('?')[0] ?? '/admin',
    withQuery,
    ...data,
  };
  res.status(status).render(`admin/${view}`, locals, (error: Error | null, html?: string) => {
    if (error) {
      logger.error({ err: error.message, view }, 'панел: изгледът не се рендерира');
      if (!res.headersSent) res.status(500).type('text/plain').send('500');
      return;
    }
    res.send(html);
  });
}

export type AdminErrorKind =
  | 'forbidden'
  | 'notFound'
  | 'unavailable'
  | 'csrf'
  | 'tooMany'
  | 'serverError'
  | 'badRequest'
  | 'denied';

const STATUS: Record<AdminErrorKind, number> = {
  forbidden: 403,
  notFound: 404,
  unavailable: 503,
  csrf: 403,
  tooMany: 429,
  serverError: 500,
  badRequest: 400,
  denied: 403,
};

export function renderAdminError(req: Request, res: Response, kind: AdminErrorKind): void {
  renderAdmin(req, res, 'error', { kind }, STATUS[kind]);
}

/** PRG: пренасочване след POST с код на резултата. `to` е наш път (никога от вход). */
export function done(res: Response, to: string, code: keyof typeof RESULTS): void {
  const separator = to.includes('?') ? '&' : '?';
  res.redirect(303, `${to}${separator}r=${code}`);
}
