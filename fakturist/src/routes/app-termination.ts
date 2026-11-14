import { Router, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { HOUR } from '../time.js';
import { kickOutbox } from '../mail/outbox.js';
import { ID_PATTERN } from '../ids.js';
import {
  cancelTermination,
  requestTermination,
  TERMINATION_GRACE_MS,
  TerminationError,
} from '../accounts/termination.js';

/**
 * „Прекратяване“ на фирмата (SPEC 65–66): обяснението, заявката с паролата и отмяната до срока. Само
 * собственикът (`billing.manage`, пряк член); останалите виждат състоянието. Мастърът — от панела.
 */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

const ORG_PATH = new RegExp(`^/app/o/(${ID_PATTERN})(?:/|$)`);

const PasswordForm = z.object({ password: z.string().min(1).max(256) });
const ConfirmForm = PasswordForm.extend({ confirm: z.literal('on') });

function code(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z]{2,30}$/.test(value) ? value : '';
}

async function render(req: Request, res: Response, error = '', status = 200): Promise<void> {
  const access = await requireOrg(req, 'documents.read');
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: access.organizationId },
    select: { id: true, legalName: true, terminatedAt: true, purgeAfter: true },
  });
  res.status(status).render('app/termination', {
    org,
    canManage: roleCan(access.role, 'billing.manage') && access.viaFirmId === null,
    canExport: roleCan(access.role, 'org.settings') && access.viaFirmId === null,
    graceDays: Math.round(TERMINATION_GRACE_MS / (24 * HOUR)),
    ok: code(req.query['ok']),
    error,
  });
}

async function owner(req: Request) {
  const access = await requireOrg(req, 'billing.manage');
  if (access.viaFirmId !== null) throw new HttpError(404);
  return access;
}

export function appTerminationRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/prekratyavane', async (req, res) => {
    await render(req, res);
  });

  router.post('/app/o/:orgId/prekratyavane', limiter, async (req, res) => {
    const access = await owner(req);
    const parsed = ConfirmForm.safeParse(req.body);
    if (!parsed.success) return render(req, res, 'confirm', 400);
    try {
      await requestTermination({
        organizationId: access.organizationId,
        actor: { userId: req.principal!.user.id, master: false },
        password: parsed.data.password,
      });
    } catch (error) {
      if (error instanceof TerminationError) return render(req, res, error.code, 400);
      throw error;
    }
    kickOutbox();
    res.redirect(303, `/app/o/${access.organizationId}/prekratyavane?ok=terminated`);
  });

  router.post('/app/o/:orgId/prekratyavane/otmeni', limiter, async (req, res) => {
    const access = await owner(req);
    const parsed = PasswordForm.safeParse(req.body);
    if (!parsed.success) return render(req, res, 'password', 400);
    try {
      await cancelTermination({
        organizationId: access.organizationId,
        actor: { userId: req.principal!.user.id, master: false },
        password: parsed.data.password,
      });
    } catch (error) {
      if (error instanceof TerminationError) return render(req, res, error.code, 400);
      throw error;
    }
    kickOutbox();
    res.redirect(303, `/app/o/${access.organizationId}/prekratyavane?ok=cancelled`);
  });

  return router;
}

/** Запис в прекратена фирма (guards.ts → 409 „terminated“): страница с обяснение, не гол код. */
export function terminatedErrorPage(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!(error instanceof HttpError) || error.status !== 409 || error.message !== 'terminated') {
    next(error);
    return;
  }
  // Параметрите на маршрута не стигат до обработчика на грешки — id-то е от пътя.
  const orgId = ORG_PATH.exec(req.path)?.[1] ?? '';
  res.status(409).render('app/terminated', { orgId });
}
