import express, { type Express } from 'express';
import { attachSession } from '../auth/sessions.js';
import { csrf } from '../auth/guards.js';
import { appLocals } from '../http/view.js';
import { webhooksRouter } from './webhooks.js';
import { authRouter } from './auth.js';
import { inviteRouter } from './invite.js';
import { memberInviteRouter } from './member-invite.js';
import { installRouter } from './install.js';
import { accountRouter } from './account.js';
import { appRouter } from './app.js';
import { adminRouter } from './admin.js';

/**
 * Рутерите на приложението — в реда им. Webhook-ът е преди парсването на формите (иска суровото тяло) и
 * без сесия и CSRF (пази го подписът). Витрината и SEO са в server.ts преди тях.
 */
export function mountApp(app: Express): void {
  app.use(webhooksRouter());
  app.use(express.urlencoded({ extended: true, limit: '256kb', parameterLimit: 2000 }));
  app.use(attachSession());
  app.use(csrf());
  app.use(appLocals());
  app.use(authRouter());
  app.use(accountRouter());
  app.use(installRouter());
  app.use(inviteRouter());
  app.use(memberInviteRouter());
  app.use(appRouter());
  app.use(adminRouter());
}
