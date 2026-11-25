import express, { type Express } from 'express';
import { attachSession } from '../auth/sessions.js';
import { csrf, HttpError } from '../auth/guards.js';
import { rejectControlChars } from '../http/body-guard.js';
import { appLocals } from '../http/view.js';
import { webhooksRouter } from './webhooks.js';
import { apiRouter } from '../api/router.js';
import { authRouter } from './auth.js';
import { inviteRouter } from './invite.js';
import { memberInviteRouter } from './member-invite.js';
import { installRouter } from './install.js';
import { accountRouter } from './account.js';
import { languageRouter } from './language.js';
import { appRouter } from './app.js';
import { adminRouter } from './admin.js';

/**
 * Рутерите на приложението — в реда им. Webhook-ът е преди парсването на формите (иска суровото тяло) и
 * без сесия и CSRF (пази го подписът). Витрината и SEO са в server.ts преди тях.
 */
export function mountApp(app: Express): void {
  app.use(webhooksRouter());
  // REST API (SPEC 53): собствен JSON парсер, ключ вместо сесия, без CSRF — преди формите и сесията.
  app.use(apiRouter());
  app.use(express.urlencoded({ extended: true, limit: '256kb', parameterLimit: 2000 }));
  app.use(rejectControlChars((_req, _res, next) => next(new HttpError(400))));
  app.use(attachSession());
  app.use(csrf());
  app.use(appLocals());
  app.use(authRouter());
  app.use(accountRouter());
  app.use(languageRouter());
  app.use(installRouter());
  app.use(inviteRouter());
  app.use(memberInviteRouter());
  app.use(appRouter());
  app.use(adminRouter());
}
