import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { apiError, requireCapability, requireCsrf, requireUser } from '../auth/guards.js';
import type { Authorizer } from '../realtime/hub.js';
import { loadViewers, type Viewer } from '../services/collab/access.js';
import {
  effectivePresence,
  HEARTBEAT_EVERY_MS,
  presenceAudience,
  visiblePresenceSubjects,
} from '../services/collab/presence.js';
import { Id, perUserLimit, viewerOf } from './collab-common.js';

/**
 * Присъствие (FR-18). Само координация: НЕ е доказателство за дежурство и не се ползва за
 * надзор. Heartbeat от клиента на 60 s; OFFLINE се изчислява при четене (3 мин без heartbeat).
 */

const Heartbeat = z.object({ status: z.enum(['ONLINE', 'AWAY']).default('ONLINE') });
const Settings = z.object({ showLastSeen: z.boolean() });
const Query = z.object({
  userIds: z
    .string()
    .max(4200)
    .transform((s) => [
      ...new Set(
        s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(Id).min(1).max(100)),
});

export function presenceRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));
  const use = requireCapability('conversation:use');
  const beatLimit = perUserLimit(60 * 1000, 12, 'presence-beat');

  /** `presence.changed` до хората, които и в момента на изпращане виждат присъствието му. */
  const announce = (subject: Viewer, view: ReturnType<typeof effectivePresence>) => {
    if (deps.hub.size() === 0) return;
    const authorize: Authorizer = async (userIds) => {
      const viewers = await loadViewers(deps.db, userIds, subject.tenantId);
      // Паралелно, не една по една: authorize държи опашката на хъба — последователни заявки
      // по свързан получател бавят всички останали събития. Правилото е същото (presence.ts).
      const seen = await Promise.all(
        [...viewers].map(async ([id, v]) => {
          const sees = await visiblePresenceSubjects(deps.db, v, [subject.id]);
          return sees.has(subject.id) ? id : null;
        }),
      );
      const out = new Map<string, Record<string, unknown>>();
      for (const id of seen) if (id) out.set(id, { userId: subject.id, ...view });
      return out;
    };
    deps.hub
      .publish(
        { type: 'presence.changed', tenantId: subject.tenantId, actorId: subject.id },
        () => presenceAudience(deps.db, subject),
        authorize,
      )
      .catch((err: unknown) =>
        deps.logger.warn({ errName: err instanceof Error ? err.name : 'unknown' }, 'присъствие'),
      );
  };

  router.post('/presence/heartbeat', use, beatLimit, async (req, res, next) => {
    try {
      const body = Heartbeat.safeParse(req.body ?? {});
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const now = new Date();
      const before = await deps.db.userPresence.findUnique({ where: { userId: viewer.id } });
      const row = await deps.db.userPresence.upsert({
        where: { userId: viewer.id },
        create: { userId: viewer.id, status: body.data.status, lastSeenAt: now },
        update: { status: body.data.status, lastSeenAt: now },
      });
      const previous = effectivePresence(before, now).status;
      const others = effectivePresence(row, now);
      if (previous !== others.status) announce(viewer, others);
      res.json({
        presence: effectivePresence(row, now, true),
        showLastSeen: row.showLastSeen,
        heartbeatEveryMs: HEARTBEAT_EVERY_MS,
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/presence/me', use, async (req, res, next) => {
    try {
      const body = Settings.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const row = await deps.db.userPresence.upsert({
        where: { userId: viewer.id },
        // Без heartbeat досега — „последно видян“ е отдавна, т.е. OFFLINE.
        create: { userId: viewer.id, status: 'OFFLINE', lastSeenAt: new Date(0), ...body.data },
        update: body.data,
      });
      res.json({
        presence: effectivePresence(row, new Date(), true),
        showLastSeen: row.showLastSeen,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/presence', use, async (req, res, next) => {
    try {
      const q = Query.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const visible = await visiblePresenceSubjects(deps.db, viewer, q.data.userIds);
      const rows = await deps.db.userPresence.findMany({ where: { userId: { in: [...visible] } } });
      const byUser = new Map(rows.map((r) => [r.userId, r]));
      const now = new Date();
      // Невидимите просто липсват — отговорът не казва дали човекът съществува.
      res.json({
        presence: [...visible].map((userId) => ({
          userId,
          ...effectivePresence(byUser.get(userId) ?? null, now, userId === viewer.id),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
