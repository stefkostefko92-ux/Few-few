import { Router } from "express";
import { prisma } from "@aso/db";
import { mailDisableSchema, mailSettingsSchema } from "@aso/shared";
import { verifyPassword } from "../auth/passwords.js";
import { asyncHandler, HttpError, unauthorized } from "../http.js";
import { requireRole } from "../middleware/requireAuth.js";
import { mailAdminLimiter } from "../middleware/rateLimit.js";
import { sendTestEmail } from "../email/mailer.js";
import { settingsKeyReady } from "../email/secrets.js";
import {
  checkMailInput,
  disableMailSettings,
  mailSettingsView,
  saveMailSettings,
} from "../email/settings.js";
import { audit, resolveActorName } from "./adminShared.js";

/**
 * „Имейл (Brevo)“ в админ панела — по модела на Rilievi Impianti („Email del
 * portale“ в конзолата на MASTER): SMTP сървърът, портът, логинът, ключът (само се
 * пише — никога не се показва; празно = остава записаният) и подателят; пробно
 * писмо до самия собственик; изключване (пак важи .env). Само OWNER; записът и
 * изключването искат паролата на акаунта — оттук тръгват всички писма на портала.
 * Монтира се в adminRouter (без собствен префикс, като adminCrudRouter).
 */
export const adminMailRouter: Router = Router();
const OWNER = requireRole("OWNER");

/** Паролата на собственика (argon2); грешна — 403, броят се в лимита. */
async function confirmAccountPassword(userId: string, password: string): Promise<{ email: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw unauthorized();
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    throw new HttpError(403, "wrong_password", "Грешна парола на акаунта");
  }
  return { email: user.email };
}

/** GET /api/admin/mail — записаното (без ключа) и откъде тръгват писмата сега. */
adminMailRouter.get(
  "/mail",
  OWNER,
  asyncHandler(async (_req, res) => {
    res.json(await mailSettingsView());
  }),
);

/** PUT /api/admin/mail — записва и включва настройката (Brevo SMTP). */
adminMailRouter.put(
  "/mail",
  OWNER,
  mailAdminLimiter,
  asyncHandler(async (req, res) => {
    const input = mailSettingsSchema.parse(req.body);
    if (!settingsKeyReady()) {
      throw new HttpError(503, "settings_key_missing", "Липсва SETTINGS_SECRET_KEY на сървъра — следващият деплой го създава");
    }
    const saved = await prisma.mailSettings.findUnique({ where: { id: "mail" }, select: { host: true, username: true } });
    checkMailInput(input, saved);
    await confirmAccountPassword(req.user!.sub, input.accountPassword);
    await saveMailSettings(req.user!.sub, input);
    // Одит без ключа и без логина.
    await audit(req.user!, await resolveActorName(req.user!.sub), "mail_settings_saved", null, {
      host: input.host,
      port: input.port,
      newKey: input.password.length > 0,
    });
    res.json(await mailSettingsView());
  }),
);

/** POST /api/admin/mail/test — пробно писмо до самия собственик. */
adminMailRouter.post(
  "/mail/test",
  OWNER,
  mailAdminLimiter,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { email: true } });
    if (!user) throw unauthorized();
    const result = await sendTestEmail(
      user.email,
      "АСО — пробно писмо",
      "Това е пробно писмо от админ панела на АСО: пощата на портала работи.",
    );
    await audit(req.user!, await resolveActorName(req.user!.sub), "mail_test", null, {
      result: result.result,
      ...(result.result === "error" ? { code: result.code } : {}),
    });
    res.json(result);
  }),
);

/** POST /api/admin/mail/disable — изключва настройката от панела (остава записана). */
adminMailRouter.post(
  "/mail/disable",
  OWNER,
  mailAdminLimiter,
  asyncHandler(async (req, res) => {
    const { accountPassword } = mailDisableSchema.parse(req.body);
    await confirmAccountPassword(req.user!.sub, accountPassword);
    if (await disableMailSettings(req.user!.sub)) {
      await audit(req.user!, await resolveActorName(req.user!.sub), "mail_settings_disabled", null, {});
    }
    res.json(await mailSettingsView());
  }),
);
