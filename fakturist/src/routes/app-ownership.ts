import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { PASSWORD_MAX_LENGTH } from '../auth/password.js';
import {
  cancelHandover,
  decideFirmHandover,
  HandoverError,
  handoverStatus,
  startFirmHandover,
  startPersonHandover,
} from '../accounts/handover.js';
import { kickOutbox } from '../mail/outbox.js';
import { MINUTE } from '../time.js';

/**
 * „Собственост“ на фирмата (SPEC 84–86): само прекият собственик предава — на човек по имейл или на кантора
 * с действащо пълномощно. Паролата и 2FA кодът се проверяват с таван по профил (като в „Сигурност“).
 * Решението на кантората по предложение — от собственика или администратора ѝ (`members.manage`).
 */
const limiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
  handler: (req, res) =>
    res.redirect(303, `/app/o/${String(req.params['orgId'])}/sobstvenost?err=rateLimited`),
});

const Confirm = z.object({
  password: z.string().max(PASSWORD_MAX_LENGTH),
  code: z.string().trim().max(10).optional(),
});

async function owner(req: Request) {
  const access = await requireOrg(req, 'documents.read');
  if (access.viaFirmId !== null || access.role !== 'OWNER') throw new HttpError(404);
  return access;
}

const CODES = new Set([
  'notOwner',
  'password',
  'code',
  'reviewPending',
  'locked',
  'terminated',
  'sameUser',
  'invalidEmail',
  'noMandate',
  'notCompany',
  'rateLimited',
  'invalid',
  'expired',
  'notAllowed',
  'notFound',
]);
const flash = (value: unknown) => (typeof value === 'string' && CODES.has(value) ? value : null);
const OK = new Set(['person', 'firm', 'cancelled', 'accepted', 'declined']);

export function appOwnershipRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/sobstvenost', async (req, res) => {
    const access = await owner(req);
    const [org, status, user] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: access.organizationId },
        select: { id: true, legalName: true, kind: true },
      }),
      handoverStatus(access.organizationId),
      prisma.user.findUniqueOrThrow({
        where: { id: req.principal!.user.id },
        select: { totpEnabledAt: true },
      }),
    ]);
    res.render('app/ownership', {
      org,
      status,
      twoFactor: user.totpEnabledAt !== null,
      ok: typeof req.query['ok'] === 'string' && OK.has(req.query['ok']) ? req.query['ok'] : null,
      err: flash(req.query['err']),
    });
  });

  const back = (orgId: string, query: string) => `/app/o/${orgId}/sobstvenost?${query}`;

  router.post('/app/o/:orgId/sobstvenost/chovek', limiter, async (req, res) => {
    const access = await owner(req);
    const body = Confirm.extend({ email: z.string().max(254) }).safeParse(req.body);
    if (!body.success) return res.redirect(303, back(access.organizationId, 'err=invalid'));
    try {
      await startPersonHandover({
        organizationId: access.organizationId,
        actorId: req.principal!.user.id,
        email: body.data.email,
        password: body.data.password,
        ...(body.data.code ? { code: body.data.code } : {}),
      });
      kickOutbox();
      res.redirect(303, back(access.organizationId, 'ok=person'));
    } catch (error) {
      if (!(error instanceof HandoverError)) throw error;
      res.redirect(303, back(access.organizationId, `err=${error.code}`));
    }
  });

  router.post('/app/o/:orgId/sobstvenost/kantora', limiter, async (req, res) => {
    const access = await owner(req);
    const body = Confirm.extend({ firmId: z.string().min(1).max(40) }).safeParse(req.body);
    if (!body.success) return res.redirect(303, back(access.organizationId, 'err=invalid'));
    try {
      await startFirmHandover({
        organizationId: access.organizationId,
        actorId: req.principal!.user.id,
        firmId: body.data.firmId,
        password: body.data.password,
        ...(body.data.code ? { code: body.data.code } : {}),
      });
      kickOutbox();
      res.redirect(303, back(access.organizationId, 'ok=firm'));
    } catch (error) {
      if (!(error instanceof HandoverError)) throw error;
      res.redirect(303, back(access.organizationId, `err=${error.code}`));
    }
  });

  router.post('/app/o/:orgId/sobstvenost/otmeni', async (req, res) => {
    const access = await owner(req);
    await cancelHandover({
      organizationId: access.organizationId,
      actorId: req.principal!.user.id,
    });
    res.redirect(303, back(access.organizationId, 'ok=cancelled'));
  });

  // Кантората решава по предложение за поемане (началото на кантората — `/app/o/<кантора>`).
  router.post('/app/o/:orgId/predlozheniya/:id/:decision', async (req, res) => {
    const access = await requireOrg(req, 'members.manage');
    if (access.viaFirmId !== null) throw new HttpError(404);
    const decision = String(req.params['decision']);
    if (decision !== 'priemi' && decision !== 'otkazhi') throw new HttpError(404);
    const home = '/app';
    try {
      await decideFirmHandover({
        handoverId: String(req.params['id']),
        firmId: access.organizationId,
        actorId: req.principal!.user.id,
        accept: decision === 'priemi',
      });
      kickOutbox();
      res.redirect(303, `${home}?handover=${decision === 'priemi' ? 'accepted' : 'declined'}`);
    } catch (error) {
      if (!(error instanceof HandoverError)) throw error;
      if (error.code === 'notFound') throw new HttpError(404);
      res.redirect(303, `${home}?handoverErr=${error.code}`);
    }
  });

  return router;
}
