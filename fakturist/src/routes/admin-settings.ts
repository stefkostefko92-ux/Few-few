import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { HttpError } from '../auth/guards.js';
import { invalidateSettings, SETTINGS, setting, type SettingKey } from '../admin/settings.js';
import {
  integrationState,
  integrationsView,
  isIntegrationCode,
  parseIntegrationForm,
  recordCheck,
  revolutSettings,
  saveIntegration,
  smtpSettings,
  type IntegrationCode,
} from '../admin/integrations.js';
import { checkRevolut, checkSmtp, type CheckResult } from '../admin/integration-checks.js';
import { smtpTransport } from '../mail/mailer.js';

/** Страницата „Настройки“: глобалните настройки + интеграциите (Brevo SMTP, Revolut Merchant API). */
async function renderSettings(
  req: Request,
  res: Response,
  extra: { status?: number; errors?: Record<string, string>; errorsFor?: IntegrationCode } = {},
): Promise<void> {
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(SETTINGS) as SettingKey[]) values[key] = await setting(key);
  res.status(extra.status ?? 200).render('admin/settings', {
    settings: SETTINGS,
    values,
    saved: req.query['ok'] === '1',
    integrations: await integrationsView(),
    integrationErrors: extra.errors ?? {},
    errorsFor: extra.errorsFor ?? null,
    webhookUrl: `${config().PUBLIC_BASE_URL}/webhooks/revolut`,
    masterEmail: req.principal!.user.email,
  });
}

export function adminSettingsRouter(): Router {
  const router = Router();

  router.get('/admin/nastroyki', async (req, res) => {
    await renderSettings(req, res);
  });

  router.post('/admin/nastroyki', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const actorId = req.principal!.user.id;
    await prisma.$transaction(async (tx) => {
      for (const [key, definition] of Object.entries(SETTINGS)) {
        const raw = body[key];
        let value: unknown;
        if (typeof definition.default === 'boolean') value = raw === 'on';
        else if (typeof definition.default === 'number') value = Number(raw);
        else value = typeof raw === 'string' ? raw.trim() : definition.default;
        const parsed = definition.schema.safeParse(value);
        if (!parsed.success) throw new HttpError(400, `Невалидна стойност за ${key}`);
        await tx.setting.upsert({
          where: { key },
          create: { key, value: parsed.data, updatedById: actorId },
          update: { value: parsed.data, updatedById: actorId },
        });
      }
      await audit(tx, { actorId, action: 'admin.settings.saved' });
    });
    invalidateSettings();
    res.redirect(303, '/admin/nastroyki?ok=1');
  });

  // --- Интеграции: запис (тайните — шифровани; празно поле пази старата стойност) ------------------
  router.post('/admin/integratsii/:code', async (req, res) => {
    const code = String(req.params['code']);
    if (!isIntegrationCode(code)) throw new HttpError(404);
    const state = await integrationState(code);
    const parsed = parseIntegrationForm(
      code,
      req.body as Record<string, unknown>,
      state?.secrets ?? {},
      state?.unreadable ? Object.keys(state.hints) : [],
    );
    if (!parsed.ok) {
      return renderSettings(req, res, { status: 400, errors: parsed.errors, errorsFor: code });
    }
    await saveIntegration({ code, ...parsed, actorId: req.principal!.user.id });
    res.redirect(303, `/admin/nastroyki?ok=1#${code}`);
  });

  // --- Интеграции: „Провери връзката“ --------------------------------------------------------------
  router.post('/admin/integratsii/:code/proverka', async (req, res) => {
    const code = String(req.params['code']);
    if (!isIntegrationCode(code)) throw new HttpError(404);
    let result: CheckResult;
    if (code === 'smtp') {
      const settings = await smtpSettings();
      result = settings
        ? await checkSmtp(smtpTransport(settings), {
            from: settings.from,
            to: req.principal!.user.email,
            secrets: [settings.pass ?? ''],
            connection: { secure: settings.secure, port: settings.port },
          })
        : { ok: false, error: 'notConfigured' };
    } else {
      result = await checkRevolut(await revolutSettings());
    }
    await recordCheck(code, result, req.principal!.user.id);
    res.redirect(303, `/admin/nastroyki#${code}`);
  });

  return router;
}
