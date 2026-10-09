import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { qrSvg } from '../qr.js';
import { hashToken, randomToken } from '../crypto.js';
import { isVersion, normalizeRevision } from '../domain/versions.js';
import { QR_TOKEN_BYTES } from '../services/devices.js';

/**
 * Анаграфика (FR-01, §13.1): продукти с HW ревизии и обхват на FW, и физическите табла.
 * Без нея няма „точен продуктов контекст“ — затова е първото, което се въвежда (§18.2 т.2).
 */

const version = z.string().trim().max(20).refine(isVersion, 'версия като 4.2.1');

const ProductInput = z.object({
  family: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(''),
  revisions: z
    .array(
      z.object({
        hwRevision: z.string().trim().min(1).max(20),
        fwMin: version,
        fwMax: version.optional(),
      }),
    )
    .min(1)
    .max(50),
});

const DeviceInput = z.object({
  serial: z.string().trim().min(1).max(80),
  productModel: z.string().trim().min(1).max(80),
  hwRevision: z.string().trim().min(1).max(20),
  firmware: version,
  companyName: z.string().trim().min(1).max(120).optional(),
  options: z.record(z.string().max(40), z.string().max(80)).default({}),
});

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export function adminCatalogRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin), requireCapability('kb:manage'));

  router.post('/products', async (req, res, next) => {
    try {
      const parsed = ProductInput.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const input = parsed.data;
      try {
        const product = await deps.db.product.create({
          data: {
            tenantId: p.user.tenantId,
            family: input.family,
            model: input.model,
            description: input.description,
            revisions: {
              create: input.revisions.map((r) => ({
                hwRevision: normalizeRevision(r.hwRevision),
                fwMin: r.fwMin,
                fwMax: r.fwMax ?? null,
              })),
            },
          },
        });
        await appendAudit(deps.db, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'catalog.product.create',
          objectType: 'product',
          objectId: product.id,
          detail: { model: product.model },
        });
        res.status(201).json({ productId: product.id });
      } catch (err) {
        if (isUniqueViolation(err)) return apiError(res, 409, 'duplicate');
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  router.post('/devices', async (req, res, next) => {
    try {
      const parsed = DeviceInput.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const input = parsed.data;
      const revision = await deps.db.productRevision.findFirst({
        where: {
          hwRevision: normalizeRevision(input.hwRevision),
          product: { tenantId: p.user.tenantId, model: input.productModel },
        },
      });
      if (!revision) return apiError(res, 422, 'unknown_revision');
      let companyId: string | null = null;
      if (input.companyName) {
        const company = await deps.db.company.upsert({
          where: { tenantId_name: { tenantId: p.user.tenantId, name: input.companyName } },
          create: { tenantId: p.user.tenantId, name: input.companyName },
          update: {},
        });
        companyId = company.id;
      }
      try {
        const device = await deps.db.device.create({
          data: {
            tenantId: p.user.tenantId,
            companyId,
            serial: input.serial,
            productRevisionId: revision.id,
            firmware: input.firmware,
            options: input.options,
          },
        });
        await appendAudit(deps.db, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'catalog.device.create',
          objectType: 'device',
          objectId: device.id,
        });
        res.status(201).json({ deviceId: device.id });
      } catch (err) {
        if (isUniqueViolation(err)) return apiError(res, 409, 'duplicate');
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  // FR-13: нов QR етикет за таблото. В базата — само HMAC на токена; старият етикет спира да
  // важи веднага. Линкът и SVG-то се връщат ВЕДНЪЖ (за печат) — после не могат да се възстановят.
  router.post('/devices/:serial/qr', async (req, res, next) => {
    try {
      const serial = z.string().trim().min(1).max(80).safeParse(req.params.serial);
      if (!serial.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const token = randomToken(QR_TOKEN_BYTES);
      const updated = await deps.db.device.updateMany({
        where: { tenantId: p.user.tenantId, serial: serial.data },
        data: { qrTokenHash: hashToken(token, deps.sessions.pepper) },
      });
      if (updated.count === 0) return apiError(res, 404, 'not_found');
      const device = await deps.db.device.findUniqueOrThrow({
        where: { tenantId_serial: { tenantId: p.user.tenantId, serial: serial.data } },
        select: { id: true },
      });
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'catalog.device.qr',
        objectType: 'device',
        objectId: device.id,
      });
      const url = `${deps.publicOrigin}/q/${token}`;
      res.json({ url, svg: await qrSvg(url) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
