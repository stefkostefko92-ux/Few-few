import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../db.js';
import { HOUR } from '../time.js';
import { kickOutbox } from '../mail/outbox.js';
import {
  ANNOUNCEMENT_KINDS,
  AnnouncementError,
  AnnouncementSchema,
  earliestEffective,
  sendAnnouncement,
} from '../admin/announcements.js';

/** „Съобщения“ в панела (под requireMaster — src/routes/admin.ts): изпратените и формата; до 5 на час. */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

const code = (value: unknown) =>
  typeof value === 'string' && /^[a-zA-Z]{2,20}$/.test(value) ? value : '';

export function adminAnnouncementsRouter(): Router {
  const router = Router();

  router.get('/admin/saobshteniya', async (req, res) => {
    const [sent, audience] = await Promise.all([
      prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { createdBy: { select: { name: true } } },
      }),
      prisma.user.count({
        where: {
          disabledAt: null,
          memberships: {
            some: { role: { in: ['OWNER', 'ADMIN'] }, organization: { deletedAt: null } },
          },
        },
      }),
    ]);
    res.render('admin/announcements', {
      sent,
      audience,
      kinds: ANNOUNCEMENT_KINDS,
      earliest: earliestEffective(),
      ok: code(req.query['ok']),
      err: code(req.query['err']),
      count: Number(req.query['broi']) || 0,
    });
  });

  router.post('/admin/saobshteniya', limiter, async (req, res) => {
    const parsed = AnnouncementSchema.safeParse(req.body);
    if (!parsed.success) return res.redirect(303, '/admin/saobshteniya?err=invalid');
    try {
      const result = await sendAnnouncement({ actorId: req.principal!.user.id, form: parsed.data });
      kickOutbox();
      res.redirect(303, `/admin/saobshteniya?ok=sent&broi=${result.recipients}`);
    } catch (error) {
      if (error instanceof AnnouncementError) {
        return res.redirect(303, `/admin/saobshteniya?err=${error.code}`);
      }
      throw error;
    }
  });

  return router;
}
