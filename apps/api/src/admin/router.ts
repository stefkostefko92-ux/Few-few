import path from 'node:path';

import { AdminRole, Prisma, ReportStatus } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { env } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { enqueueMunicipalityEmail } from '../queue/email.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

export const adminRouter = Router();

// Всичко под /admin изисква валидна сесия.
adminRouter.use(requireAuth);

/** Чете параметър от пътя като string (Express 5 типизира стойностите широко). */
function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}

const listQuerySchema = z.object({
  status: z.nativeEnum(ReportStatus).optional(),
  categorySlug: z.string().min(1).max(64).optional(),
  settlementSlug: z.string().min(1).max(64).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

adminRouter.get('/reports', async (req: Request, res: Response): Promise<void> => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Невалидни параметри за филтриране.' });
    return;
  }
  const { status, categorySlug, settlementSlug, page, pageSize } = parsed.data;
  const where: Prisma.ReportWhereInput = {
    ...(status ? { status } : {}),
    ...(categorySlug ? { categoryId: categorySlug } : {}),
    ...(settlementSlug ? { settlementId: settlementSlug } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category: { select: { slug: true, nameBg: true } },
        settlement: { select: { slug: true, nameBg: true } },
        _count: { select: { media: true } },
      },
    }),
  ]);

  res.json({
    page,
    pageSize,
    total,
    items: rows.map((r) => ({
      id: r.id,
      publicCode: r.publicCode,
      status: r.status,
      category: r.category,
      settlement: r.settlement,
      description: r.description,
      mediaCount: r._count.media,
      createdAt: r.createdAt,
    })),
  });
});

adminRouter.get('/reports/:id', async (req: Request, res: Response): Promise<void> => {
  const report = await prisma.report.findUnique({
    where: { id: pathParam(req, 'id') },
    include: {
      category: { select: { slug: true, nameBg: true } },
      settlement: { select: { slug: true, nameBg: true } },
      media: { select: { id: true, kind: true, bytes: true, createdAt: true } },
      events: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { email: true } } },
      },
    },
  });
  if (!report) {
    res.status(404).json({ error: 'Сигналът не е намерен.' });
    return;
  }

  res.json({
    id: report.id,
    publicCode: report.publicCode,
    status: report.status,
    category: report.category,
    settlement: report.settlement,
    description: report.description,
    lat: report.lat,
    lng: report.lng,
    reporterName: report.reporterName,
    reporterPhone: report.reporterPhone,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    media: report.media.map((m) => ({
      id: m.id,
      kind: m.kind,
      bytes: m.bytes,
      url: `/admin/reports/${report.id}/media/${m.id}`,
      createdAt: m.createdAt,
    })),
    events: report.events.map((e) => ({
      type: e.type,
      note: e.note,
      actor: e.actor?.email ?? null,
      createdAt: e.createdAt,
    })),
  });
});

const mediaRoot = path.resolve(env.MEDIA_DIR);

adminRouter.get(
  '/reports/:id/media/:mediaId',
  async (req: Request, res: Response): Promise<void> => {
    const media = await prisma.reportMedia.findFirst({
      where: { id: pathParam(req, 'mediaId'), reportId: pathParam(req, 'id') },
    });
    if (!media) {
      res.status(404).json({ error: 'Файлът не е намерен.' });
      return;
    }
    // Защита от path traversal — пътят трябва да е в папката за медия.
    const absolute = path.resolve(media.path);
    if (absolute !== mediaRoot && !absolute.startsWith(mediaRoot + path.sep)) {
      logger.error({ mediaId: media.id, path: media.path }, 'media path outside root');
      res.status(404).json({ error: 'Файлът не е намерен.' });
      return;
    }
    res.sendFile(absolute, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: 'Файлът не е намерен.' });
      }
    });
  },
);

/** Обща смяна на статус с одит събитие; връща дали преходът е минал. */
async function transition(
  reportId: string,
  from: ReportStatus[],
  to: ReportStatus,
  actorId: string,
  type: string,
  note?: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.report.updateMany({
      where: { id: reportId, status: { in: from } },
      data: { status: to },
    });
    if (moved.count === 0) {
      return false;
    }
    await tx.reportEvent.create({ data: { reportId, actorId, type, note } });
    return true;
  });
}

async function reportStatus(reportId: string): Promise<ReportStatus | null> {
  const r = await prisma.report.findUnique({
    where: { id: reportId },
    select: { status: true },
  });
  return r?.status ?? null;
}

adminRouter.post(
  '/reports/:id/claim',
  requireRole(AdminRole.MODERATOR),
  async (req: Request, res: Response): Promise<void> => {
    const ok = await transition(
      pathParam(req, 'id'),
      [ReportStatus.PENDING],
      ReportStatus.UNDER_REVIEW,
      req.admin!.id,
      'UNDER_REVIEW',
    );
    if (!ok) {
      const status = await reportStatus(pathParam(req, 'id'));
      res.status(status ? 409 : 404).json({
        error: status ? 'Сигналът вече е поет или обработен.' : 'Сигналът не е намерен.',
      });
      return;
    }
    res.json({ status: ReportStatus.UNDER_REVIEW });
  },
);

const rejectSchema = z.object({ note: z.string().trim().min(1).max(500) });

adminRouter.post(
  '/reports/:id/reject',
  requireRole(AdminRole.MODERATOR),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Посочи причина за отказа.' });
      return;
    }
    const ok = await transition(
      pathParam(req, 'id'),
      [ReportStatus.PENDING, ReportStatus.UNDER_REVIEW],
      ReportStatus.REJECTED,
      req.admin!.id,
      'REJECTED',
      parsed.data.note,
    );
    if (!ok) {
      const status = await reportStatus(pathParam(req, 'id'));
      res.status(status ? 409 : 404).json({
        error: status ? 'Сигналът вече е обработен.' : 'Сигналът не е намерен.',
      });
      return;
    }
    res.json({ status: ReportStatus.REJECTED });
  },
);

const approveSchema = z.object({ note: z.string().trim().max(500).optional() });

adminRouter.post(
  '/reports/:id/approve',
  requireRole(AdminRole.MODERATOR),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = approveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Невалидна бележка.' });
      return;
    }
    const ok = await transition(
      pathParam(req, 'id'),
      [ReportStatus.PENDING, ReportStatus.UNDER_REVIEW],
      ReportStatus.APPROVED,
      req.admin!.id,
      'APPROVED',
      parsed.data.note,
    );
    if (!ok) {
      const status = await reportStatus(pathParam(req, 'id'));
      res.status(status ? 409 : 404).json({
        error: status ? 'Сигналът вече е обработен.' : 'Сигналът не е намерен.',
      });
      return;
    }

    const queued = await enqueueEmail(pathParam(req, 'id'));
    res.json({ status: ReportStatus.APPROVED, queued });
  },
);

adminRouter.post(
  '/reports/:id/resend',
  requireRole(AdminRole.MODERATOR),
  async (req: Request, res: Response): Promise<void> => {
    const status = await reportStatus(pathParam(req, 'id'));
    if (!status) {
      res.status(404).json({ error: 'Сигналът не е намерен.' });
      return;
    }
    if (status !== ReportStatus.APPROVED) {
      res.status(409).json({ error: 'Само одобрен, неизпратен сигнал може да се пре-изпрати.' });
      return;
    }
    const queued = await enqueueEmail(pathParam(req, 'id'));
    res.json({ status: ReportStatus.APPROVED, queued });
  },
);

/** Поставя задачата на опашката; не проваля одобрението при срив на Redis. */
async function enqueueEmail(reportId: string): Promise<boolean> {
  try {
    await enqueueMunicipalityEmail(reportId);
    return true;
  } catch (error) {
    logger.error({ err: error, reportId }, 'failed to enqueue municipality email');
    return false;
  }
}
