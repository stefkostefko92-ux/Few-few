import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { requireOrg } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';

/** Първият сегмент след /app/o/<id>/ на страниците с менюто на фирмата (HTML; файловете — не). */
const ORG_NAV_SECTIONS = new Set([
  'peppol',
  'shkafche',
  'vhodyashti',
  'proformi',
  'kontragenti',
  'artikuli',
  'serii',
  'banka',
  'plan',
  'povtaryashti',
  'api',
  'chlenove',
  'palnomoshtni',
  'nastroyki',
  'prekratyavane',
  'dnevnik',
]);

/**
 * Менюто на фирмата (views/app/_org-nav.ejs) на началото ѝ и на разделите ѝ: условията кой линк се вижда са
 * същите като досега. Достъп няма — няма меню; самата страница си връща 404/403 както преди.
 */
export function orgNavLocals() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const segment = req.path.split('/')[1] ?? '';
      if (segment !== '' && !ORG_NAV_SECTIONS.has(segment)) {
        next();
        return;
      }
      const access = await requireOrg(req, 'documents.read').catch(() => null);
      if (!access) {
        next();
        return;
      }
      const direct = access.viaFirmId === null;
      const [org, unread, pendingMandates] = await Promise.all([
        prisma.organization.findUniqueOrThrow({
          where: { id: access.organizationId },
          select: { id: true, kind: true, terminatedAt: true, purgeAfter: true },
        }),
        prisma.inboxEntry.count({ where: { recipientOrgId: access.organizationId, readAt: null } }),
        prisma.clientMandate.count({
          where: { clientId: access.organizationId, status: 'PENDING' },
        }),
      ]);
      res.locals.orgNav = {
        org,
        unread,
        pendingMandates,
        // На началото на фирмата менюто е отворено и на телефон; в разделите се свива до текущия.
        open: segment === '',
        can: {
          mandates: roleCan(access.role, 'mandates.manage') && direct,
          settings: roleCan(access.role, 'org.settings') && direct,
          members: roleCan(access.role, 'members.manage') && direct,
          billing: roleCan(access.role, 'billing.manage') && direct,
          parties: roleCan(access.role, 'parties.manage'),
          items: roleCan(access.role, 'items.manage'),
          series: roleCan(access.role, 'series.manage') && direct,
        },
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
