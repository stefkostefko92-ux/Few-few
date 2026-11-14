import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { safeEqual } from '../crypto.js';
import { prisma } from '../db.js';
import { effectiveRole, roleCan, type Capability, type MemberRole } from './roles.js';
import { ID_PATTERN, isId } from '../ids.js';

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** HTTP грешка с код — рендира се от обработчика на грешки в server.ts. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message = String(status),
  ) {
    super(message);
  }
}

/**
 * Адресите, които приемат multipart (качване на файл). Тялото им още не е разчетено, когато минава
 * csrf(), затова токенът се проверява след разчитането (src/http/upload.ts). Всеки друг multipart — 403.
 */
const MULTIPART_PATHS = [
  new RegExp(`^/app/o/${ID_PATTERN}/nastroyki/logo$`),
  new RegExp(`^/app/o/${ID_PATTERN}/vhodyashti$`),
  new RegExp(`^/app/o/${ID_PATTERN}/banka$`),
];

/**
 * CSRF: всеки запис носи токена на сесията (скрито поле `_csrf`) и, ако браузърът подаде Origin, той е
 * нашият. SameSite=Lax на бисквитката е втори слой, не единствен.
 */
export function csrf() {
  const origin = new URL(config().PUBLIC_BASE_URL).origin;
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) return next();
    const sent = req.get('origin');
    // И без сесия: чужд сайт не може да впише жертвата в своя акаунт (login CSRF) — браузърите пращат
    // Origin при всяка междусайтова POST заявка.
    if (sent && sent !== origin) return next(new HttpError(403, 'Чужд Origin'));
    if (req.is('multipart/form-data')) {
      if (!req.principal || !MULTIPART_PATHS.some((path) => path.test(req.path))) {
        return next(new HttpError(403, 'multipart'));
      }
      return next();
    }
    if (!req.principal) return next();
    const body: unknown = req.body;
    const token =
      typeof body === 'object' && body !== null && '_csrf' in body && typeof body._csrf === 'string'
        ? body._csrf
        : '';
    if (!safeEqual(token, req.principal.csrfToken)) return next(new HttpError(403, 'CSRF'));
    next();
  };
}

/** Вписан и минал втория фактор; мастър акаунт без 2FA или със смяна на паролата отива да ги направи. */
export function requireUser() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.principal;
    if (!principal) return res.redirect(303, `/vhod?next=${encodeURIComponent(req.originalUrl)}`);
    if (!principal.verified) return res.redirect(303, '/vhod/kod');
    const setup = principal.user.platformRole !== 'NONE' && !principal.user.totpEnabled;
    if ((principal.user.mustChangePassword || setup) && !req.path.startsWith('/sigurnost')) {
      return res.redirect(303, '/app/sigurnost');
    }
    next();
  };
}

export function requireMaster() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.principal?.user.platformRole !== 'MASTER') return next(new HttpError(404));
    next();
  };
}

export interface OrgAccess {
  organizationId: string;
  role: MemberRole;
  viaFirmId: string | null;
  mandateId: string | null;
}

/**
 * Ролята на текущия човек във фирмата от адреса (`:orgId`) — пряко или по пълномощно. Мастър акаунтът
 * чете всичко, но не издава от чуждо име (издаването иска членство или пълномощно — одитът казва кой).
 */
export async function orgAccess(req: Request, organizationId: string): Promise<OrgAccess | null> {
  const user = req.principal?.user;
  if (!user) return null;
  const firmIds = user.memberships.map((m) => m.organizationId);
  const mandates = await prisma.clientMandate.findMany({
    where: { clientId: organizationId, firmId: { in: firmIds } },
    select: {
      id: true,
      firmId: true,
      clientId: true,
      status: true,
      validFrom: true,
      validTo: true,
    },
  });
  const found = effectiveRole(organizationId, user.memberships, mandates);
  if (found) {
    const mandate = found.viaFirmId ? mandates.find((m) => m.firmId === found.viaFirmId) : null;
    return { organizationId, ...found, mandateId: mandate?.id ?? null };
  }
  if (user.platformRole === 'MASTER' || user.platformRole === 'SUPPORT') {
    return { organizationId, role: 'VIEWER', viaFirmId: null, mandateId: null };
  }
  return null;
}

/** Достъп + способност или 404 (не издаваме, че фирмата съществува). */
export async function requireOrg(req: Request, capability: Capability): Promise<OrgAccess> {
  const orgId = req.params['orgId'];
  if (!isId(orgId)) throw new HttpError(404);
  const access = await orgAccess(req, orgId);
  if (!access || !roleCan(access.role, capability)) throw new HttpError(404);
  return access;
}
