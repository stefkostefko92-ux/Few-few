import type express from 'express';
import type { WiredDeps } from './app.js';
import type { TotpReplayStore } from './auth/mfa.js';
import { eventsRouter } from './realtime/stream.js';
import { adminListsRouter } from './routes/admin-lists.js';
import { adminCatalogRouter } from './routes/admin-catalog.js';
import { adminDocumentsRouter } from './routes/admin-documents.js';
import { adminDocumentsIngestRouter } from './routes/admin-documents-ingest.js';
import { adminDocumentsLifecycleRouter } from './routes/admin-documents-lifecycle.js';
import { adminDocumentsViewRouter } from './routes/admin-documents-view.js';
import { adminErrorsRouter } from './routes/admin-errors.js';
import { adminErrorsLifecycleRouter } from './routes/admin-errors-lifecycle.js';
import { adminErrorsVersionsRouter } from './routes/admin-errors-versions.js';
import { adminIntegrationsRouter } from './routes/admin-integrations.js';
import { adminKpiRouter } from './routes/admin-kpi.js';
import { adminProposalsRouter } from './routes/proposals-admin.js';
import { proposalsRouter } from './routes/proposals.js';
import { adminSubjectRouter } from './routes/admin-subject.js';
import { adminUserActionsRouter } from './routes/admin-user-actions.js';
import { adminUsersRouter } from './routes/admin-users.js';
import { auditRouter } from './routes/audit.js';
import { authMfaRouter } from './routes/auth-mfa.js';
import { authSsoAdminRouter } from './routes/auth-sso-admin.js';
import { authSsoRouter } from './routes/auth-sso.js';
import { authRouter } from './routes/auth.js';
import { caseFlowRouter } from './routes/case-flow.js';
import { caseStepsRouter } from './routes/case-steps.js';
import { casesRouter } from './routes/cases.js';
import { stepPolicyRouter } from './routes/step-policy.js';
import { ticketFlowRouter } from './routes/ticket-flow.js';
import { ticketQueueRouter } from './routes/ticket-queue.js';
import { catalogRouter } from './routes/catalog.js';
import { documentViewRouter } from './routes/document-view.js';
import { docSearchRouter } from './routes/doc-search.js';
import { chatRouter } from './routes/chat.js';
import { conversationsRouter } from './routes/conversations.js';
import { filesRouter } from './routes/files.js';
import { meRouter } from './routes/me.js';
import { messageMarksRouter } from './routes/message-marks.js';
import { messagesRouter } from './routes/messages.js';
import { notificationsRouter } from './routes/notifications.js';
import { presenceRouter } from './routes/presence.js';
import { quickResponsesRouter } from './routes/quick-responses.js';
import { savedFiltersRouter } from './routes/saved-filters.js';
import { ticketsRouter } from './routes/tickets.js';
import { ssoRuntime } from './services/sso/provider.js';

/**
 * Монтирането на API рутерите (след JSON парсерите и `loadPrincipal`, преди 404 на `/api`) —
 * отделено от сглобяването в `app.ts`. РЕДЪТ е част от поведението: по-ранен рутер с
 * `router.use` (напр. kb:manage за всичко под /admin) затваря пътя за следващите. Точките на
 * монтиране са само статични префикси (етикетите на метриките — `observability/http.ts`).
 */
export function mountApiRouters(
  app: express.Express,
  deps: WiredDeps,
  totpReplay: TotpReplayStore,
): void {
  const sso = ssoRuntime(deps.sso);
  app.use('/api/v1/auth/mfa', authMfaRouter(deps, totpReplay));
  app.use('/api/v1/auth/sso', authSsoRouter(deps, sso));
  app.use('/api/v1/auth', authRouter(deps));
  app.use('/api/v1', meRouter(deps));
  // Директорията и запазените филтри — преди админ рутерите на знанието: техният `router.use`
  // иска kb:manage за всичко под /admin, а администраторът на клиента го няма.
  app.use('/api/v1', adminUsersRouter(deps));
  app.use('/api/v1', adminUserActionsRouter(deps, totpReplay));
  app.use('/api/v1', adminSubjectRouter(deps, totpReplay));
  app.use('/api/v1', savedFiltersRouter(deps));
  app.use('/api/v1/admin', authSsoAdminRouter(deps, sso));
  // Списъците (GET) — преди рутерите на знанието: фирмите са и за users:manage, а тяхното
  // `router.use` иска kb:manage за всичко под /admin.
  app.use('/api/v1/admin', adminListsRouter(deps));
  // KPI (kpi:read) — също преди рутерите на знанието (същата причина).
  app.use('/api/v1/admin', adminKpiRouter(deps));
  // Политиката за разрешенията на стъпки (policy:manage) — и тя преди рутерите на знанието.
  app.use('/api/v1/admin', stepPolicyRouter(deps));
  // Интеграцията с helpdesk (integrations:manage) — също преди рутерите на знанието.
  app.use('/api/v1/admin', adminIntegrationsRouter(deps));
  app.use('/api/v1/admin', adminCatalogRouter(deps));
  app.use('/api/v1/admin', adminDocumentsRouter(deps));
  app.use('/api/v1/admin', adminDocumentsIngestRouter(deps));
  app.use('/api/v1/admin', adminDocumentsViewRouter(deps));
  app.use('/api/v1/admin', adminDocumentsLifecycleRouter(deps));
  app.use('/api/v1/admin', adminErrorsRouter(deps));
  app.use('/api/v1/admin', adminErrorsLifecycleRouter(deps));
  app.use('/api/v1/admin', adminErrorsVersionsRouter(deps));
  // Опашката с предложенията за знанието (FR-10, §11.3) — kb:manage.
  app.use('/api/v1/admin', adminProposalsRouter(deps));
  app.use('/api/v1', auditRouter(deps));
  // FR-03: търсенето на документи (`/documents/search`) — преди справките и визуализатора.
  app.use('/api/v1', docSearchRouter(deps));
  app.use('/api/v1', catalogRouter(deps));
  app.use('/api/v1', documentViewRouter(deps));
  app.use('/api/v1', casesRouter(deps));
  // Работният поток (FR-09, FR-19, §11.2): поемане/предаване, стъпки и разрешения, тикет, опашка.
  app.use('/api/v1', caseFlowRouter(deps));
  app.use('/api/v1', caseStepsRouter(deps));
  app.use('/api/v1', chatRouter(deps));
  app.use('/api/v1', ticketsRouter(deps));
  // „Решен случай → знание“ (§11.3) — персоналът с proposal:create.
  app.use('/api/v1', proposalsRouter(deps));
  // Опашката (GET /tickets, /tickets/assignees) — преди `/tickets/:id`.
  app.use('/api/v1', ticketQueueRouter(deps));
  app.use('/api/v1', ticketFlowRouter(deps));
  app.use('/api/v1', filesRouter(deps));
  // Работното пространство (§12.3): разговори, съобщения (+ маркери, търсене), присъствие,
  // известия, бързи отговори, SSE.
  app.use('/api/v1', conversationsRouter(deps));
  app.use('/api/v1', messagesRouter(deps));
  app.use('/api/v1', messageMarksRouter(deps));
  app.use('/api/v1', presenceRouter(deps));
  app.use('/api/v1', notificationsRouter(deps));
  app.use('/api/v1', quickResponsesRouter(deps));
  app.use('/api/v1', eventsRouter(deps));
}
