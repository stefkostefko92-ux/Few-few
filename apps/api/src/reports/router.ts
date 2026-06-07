import { Prisma } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';

import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import {
  cleanupTempFiles,
  finalizeMedia,
  uploadMedia,
  type StoredMedia,
} from './media.js';
import { generatePublicCode } from './publicCode.js';
import { createReportSchema } from './schema.js';

export const reportsRouter = Router();

/** Анти-спам: ограничава анонимните подавания по IP. */
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много сигнали за кратко време. Опитай по-късно.' },
});

function getFiles(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

/** Точно 3 снимки максимум, или 1 клип — без смесване. */
function validateComposition(files: Express.Multer.File[]): string | null {
  if (files.length === 0) {
    return 'Добави поне една снимка или клип.';
  }
  const videos = files.filter((f) => f.mimetype.startsWith('video/'));
  const images = files.filter((f) => f.mimetype.startsWith('image/'));
  if (videos.length > 1) {
    return 'Може да прикачиш само един клип.';
  }
  if (videos.length === 1 && images.length > 0) {
    return 'Прикачи или снимки, или един клип — не и двете.';
  }
  return null;
}

async function createWithUniqueCode(
  data: Omit<Prisma.ReportCreateInput, 'publicCode' | 'events'>,
): Promise<{ id: string; publicCode: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const publicCode = generatePublicCode();
    try {
      const report = await prisma.report.create({
        data: {
          ...data,
          publicCode,
          events: { create: { type: 'CREATED' } },
        },
        select: { id: true, publicCode: true },
      });
      return report;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error('Неуспешно генериране на уникален код за сигнала.');
}

reportsRouter.post(
  '/',
  submitLimiter,
  uploadMedia.array('media', 3),
  async (req: Request, res: Response): Promise<void> => {
    const files = getFiles(req);

    // Honeypot: ботовете попълват скритото поле — приемаме тихо, без да пишем.
    if (typeof req.body.website === 'string' && req.body.website.length > 0) {
      await cleanupTempFiles(files);
      logger.warn({ ip: req.ip }, 'honeypot triggered on report submit');
      res.status(201).json({ publicCode: generatePublicCode() });
      return;
    }

    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      await cleanupTempFiles(files);
      res.status(400).json({
        error: 'Невалидни данни.',
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }

    const compositionError = validateComposition(files);
    if (compositionError) {
      await cleanupTempFiles(files);
      res.status(400).json({ error: compositionError });
      return;
    }

    const input = parsed.data;
    const [category, settlement] = await Promise.all([
      prisma.category.findFirst({ where: { slug: input.categorySlug, active: true } }),
      prisma.settlement.findUnique({ where: { slug: input.settlementSlug } }),
    ]);
    if (!category || !settlement) {
      await cleanupTempFiles(files);
      res.status(400).json({ error: 'Непозната категория или населено място.' });
      return;
    }

    let report: { id: string; publicCode: string };
    try {
      report = await createWithUniqueCode({
        category: { connect: { slug: category.slug } },
        settlement: { connect: { slug: settlement.slug } },
        description: input.description,
        lat: input.lat,
        lng: input.lng,
        reporterName: input.reporterName,
        reporterPhone: input.reporterPhone,
      });
    } catch (error) {
      await cleanupTempFiles(files);
      throw error;
    }

    let stored: StoredMedia[];
    try {
      stored = await finalizeMedia(report.id, files);
    } catch (error) {
      await cleanupTempFiles(files);
      throw error;
    }

    await prisma.reportMedia.createMany({
      data: stored.map((m) => ({
        reportId: report.id,
        kind: m.kind,
        path: m.path,
        bytes: m.bytes,
      })),
    });

    logger.info(
      { reportId: report.id, category: category.slug, settlement: settlement.slug },
      'report received',
    );
    res.status(201).json({ publicCode: report.publicCode });
  },
);
