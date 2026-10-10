import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { apiError, principalOf, requireCapability, requireUser } from '../auth/guards.js';

/**
 * Събитията по входа на хората. Администраторът на клиента (работодателят) НЕ ги вижда: това би
 * било дистанционно наблюдение на служителите (чл. 4 Statuto dei Lavoratori, L. 300/1970) —
 * целта на одита е сигурността на системата, не оценка на работата (правният одит, т. 7).
 * Вижда ги само администраторът на платформата (разследване на инцидент) — и той само в своя клиент.
 */
export const LOGIN_AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'auth.login_failed',
  'auth.mfa_verified',
  'auth.mfa_failed',
] as const;

/**
 * Действия на човек в работата му — като входа, само за платформения администратор: прегледът на
 * оригинал на документ (визуализаторът) е следа за изтичане на схеми, не мярка за работата на техника.
 */
export const PERSON_ACTIVITY_AUDIT_ACTIONS = [
  ...LOGIN_AUDIT_ACTIONS,
  'document.source.view',
] as const;

const short = z.string().trim().min(1).max(60);
const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

/** Филтрите на одита: само по изброените полета (`.strict()`), всички по избор. */
const AuditQuery = z
  .object({
    before: z.coerce.number().int().positive().optional(),
    /** Префикс на действието („kb.“, „user.admin_update“). */
    action: short.optional(),
    objectType: short.optional(),
    objectId: z.string().trim().min(1).max(40).optional(),
    actorId: z.string().trim().min(1).max(40).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict();

/** §14.1 GET /audit — одитът на клиента, отзад напред, с курсор. */
export function auditRouter(deps: AppDeps): Router {
  const router = Router();
  // Способността е на самия маршрут: рутерът е монтиран на /api/v1 и не бива да спира чужди пътища.
  router.get('/audit', requireUser, requireCapability('audit:read'), async (req, res, next) => {
    try {
      const q = AuditQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const f = q.data;
      // Филтрите на потребителя СЕ ДОБАВЯТ към ограничението на ролята (AND), никога не го заместват:
      // администраторът на клиента не стига до входовете и с `action=auth.`.
      // Само своят клиент — и за платформения администратор (като управлението на потребители):
      // разследване през клиенти е работа на сървъра (базата), не на уеб сесия.
      const and: Prisma.AuditEventWhereInput[] = [{ tenantId: p.user.tenantId }];
      if (p.user.role !== 'PLATFORM_ADMIN') {
        and.push({ action: { notIn: [...PERSON_ACTIVITY_AUDIT_ACTIONS] } });
      }
      if (f.before) and.push({ id: { lt: f.before } });
      if (f.action) and.push({ action: { startsWith: f.action } });
      if (f.objectType) and.push({ objectType: f.objectType });
      if (f.objectId) and.push({ objectId: f.objectId });
      if (f.actorId) and.push({ actorId: f.actorId });
      if (f.from) and.push({ at: { gte: f.from } });
      if (f.to) and.push({ at: { lt: f.to } });
      const events = await deps.db.auditEvent.findMany({
        where: { AND: and },
        orderBy: { id: 'desc' },
        take: 100,
      });
      res.json({
        events,
        next: events.length === 100 ? (events.at(-1)?.id ?? null) : null,
      });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
