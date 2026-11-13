import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../db.js';
import { requireOrg } from '../auth/guards.js';
import { endSession } from '../auth/sessions.js';
import { exportOrganization } from '../export/org-export.js';
import { closeAccount, CloseError, personalData } from '../accounts/close.js';
import { audit } from '../audit.js';
import { errorMessage, logger } from '../logger.js';
import { HOUR } from '../time.js';

/** Тежката работа (PDF на всеки документ) — до 5 износа на час за човек. */
const exportLimiter = rateLimit({
  windowMs: HOUR,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

/**
 * Износът и правата по ОРЗД (SPEC 48): архив на фирмата (OWNER/ADMIN — `org.settings`), личните данни
 * на човека като JSON и закриване на профила с паролата.
 */
export function appExportRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/iznos.zip', exportLimiter, async (req, res) => {
    const access = await requireOrg(req, 'org.settings');
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
      select: { eik: true },
    });
    await prisma.$transaction((tx) =>
      audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: access.organizationId,
        action: 'organization.exported',
        targetType: 'Organization',
        targetId: access.organizationId,
      }),
    );
    const day = new Date().toISOString().slice(0, 10);
    res
      .status(200)
      .set('Cache-Control', 'private, no-store')
      .type('application/zip')
      .set(
        'Content-Disposition',
        `attachment; filename="fakturist-${org.eik ?? 'firma'}-${day}.zip"`,
      );
    try {
      await exportOrganization(access.organizationId, {
        write: (chunk) =>
          new Promise<void>((resolve) => {
            if (res.write(chunk)) resolve();
            else res.once('drain', resolve);
          }),
      });
      res.end();
    } catch (error) {
      // Главите вече са пратени: прекъснатият архив е непълен ZIP, а грешката е в лога.
      logger.error({ err: errorMessage(error) }, 'износът на фирмата прекъсна');
      res.destroy();
    }
  });

  router.get('/app/sigurnost/moite-danni.json', async (req, res) => {
    const data = await personalData(req.principal!.user.id);
    res
      .set('Cache-Control', 'private, no-store')
      .type('application/json')
      .set('Content-Disposition', 'attachment; filename="fakturist-moite-danni.json"')
      .send(JSON.stringify(data, null, 2));
  });

  router.post('/app/sigurnost/zakrii', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    if (body['confirm'] !== 'on') return res.redirect(303, '/app/sigurnost?err=closeConfirm');
    try {
      await closeAccount({
        userId: req.principal!.user.id,
        password: typeof body['password'] === 'string' ? body['password'].slice(0, 256) : '',
      });
    } catch (error) {
      if (error instanceof CloseError) {
        return res.redirect(303, `/app/sigurnost?err=close.${error.code}`);
      }
      throw error;
    }
    await endSession(req, res);
    res.redirect(303, '/?zakrit=1');
  });

  return router;
}
