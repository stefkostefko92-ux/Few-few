import { Router } from 'express';
import { HttpError, requireOrg } from '../auth/guards.js';
import { ProfileError, updateCompanyProfile } from '../accounts/company-profile.js';

/**
 * „Данни на фирмата“ в „Настройки“ (SPEC 82): само прекият собственик. Грешката се връща на страницата
 * като `?profil=<код>`; ЕИК не се сменя оттук (само мастърът — SPEC 83).
 */
export function appCompanyProfileRouter(): Router {
  const router = Router();

  router.post('/app/o/:orgId/nastroyki/danni', async (req, res) => {
    const access = await requireOrg(req, 'org.settings');
    if (access.viaFirmId !== null || access.role !== 'OWNER') throw new HttpError(404);
    const back = `/app/o/${access.organizationId}/nastroyki`;
    try {
      await updateCompanyProfile({
        organizationId: access.organizationId,
        actor: { userId: req.principal!.user.id, master: false },
        input: req.body as Record<string, unknown>,
      });
    } catch (error) {
      if (!(error instanceof ProfileError)) throw error;
      return res.redirect(303, `${back}?profil=${error.code}#h-profile`);
    }
    res.redirect(303, `${back}?ok=danni#h-profile`);
  });

  return router;
}
