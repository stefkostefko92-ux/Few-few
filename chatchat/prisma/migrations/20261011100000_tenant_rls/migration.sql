-- Изолация на клиентите и в БАЗАТА (NFR-03, §15.1 „Tenant isolation a livello API e DB“): Row-Level
-- Security върху всяка таблица с данни на клиент. Приложението върви като `chatchat_app` (NOBYPASSRLS,
-- не е собственик) и слага клиента на заявката с `set_config('app.tenant_id', <id>, true)` — ЛОКАЛНО за
-- транзакцията (src/db/rls.ts). Без контекст (празен/липсващ) → нула реда и отказан запис: заявка, която
-- някой ден забрави tenantId, пак не вижда и не пише чужди редове (fail-closed).
--
-- ENABLE без FORCE: собственикът (`chatchat`) е само за миграциите (в Docker е и superuser — FORCE
-- там така или иначе не важи); приложението никога не върви като него — проверява го при старт
-- (src/db/guard.ts). Системните задачи през клиенти (ретенция, outbox-и, worker, CLI) — `chatchat_system`
-- (BYPASSRLS). Откриването на клиента преди вход минава САМО през тесните SECURITY DEFINER функции по-долу.

-- ─── Контекстът ─────────────────────────────────────────────────────────────────────────────────
-- Клиентът на текущата транзакция. SQL функция без SECURITY DEFINER — вгражда се в плана (индексите
-- по "tenantId" се ползват). Празен низ = няма клиент (никой ред не съвпада).
CREATE FUNCTION chatchat_tenant() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '') $$;

-- ─── Таблици с "tenantId" ───────────────────────────────────────────────────────────────────────
ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Attachment"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "Case" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Case"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "CaseHandoff" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CaseHandoff"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "CaseStepExecution" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CaseStepExecution"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Company"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Conversation"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Device"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Document"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "EmailOutbox" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmailOutbox"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "ErrorCode" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ErrorCode"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "ExternalIdentity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ExternalIdentity"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "HelpdeskDelivery" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "HelpdeskDelivery"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "HelpdeskIntegration" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "HelpdeskIntegration"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "IngestBatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IngestBatch"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "IngestItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IngestItem"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "KnowledgeProposal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "KnowledgeProposal"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "KnowledgeSnapshot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "KnowledgeSnapshot"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "MessageMark" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MessageMark"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "NotificationSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NotificationSettings"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Product"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "QuickResponse" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QuickResponse"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "SavedFilter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SavedFilter"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "SsoConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SsoConfig"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "SsoDomain" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SsoDomain"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "SsoLoginState" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SsoLoginState"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "StepApproval" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StepApproval"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "StepApprovalPolicy" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StepApprovalPolicy"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "TicketEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TicketEvent"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());

ALTER TABLE "CaseEvidence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CaseEvidence"
  USING (EXISTS (SELECT 1 FROM "Case" p WHERE p.id = "CaseEvidence"."caseId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Case" p WHERE p.id = "CaseEvidence"."caseId"));
ALTER TABLE "CaseMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CaseMessage"
  USING (EXISTS (SELECT 1 FROM "Case" p WHERE p.id = "CaseMessage"."caseId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Case" p WHERE p.id = "CaseMessage"."caseId"));
ALTER TABLE "CaseTimelineEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CaseTimelineEvent"
  USING (EXISTS (SELECT 1 FROM "Case" p WHERE p.id = "CaseTimelineEvent"."caseId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Case" p WHERE p.id = "CaseTimelineEvent"."caseId"));
ALTER TABLE "ConversationMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConversationMember"
  USING (EXISTS (SELECT 1 FROM "Conversation" p WHERE p.id = "ConversationMember"."conversationId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Conversation" p WHERE p.id = "ConversationMember"."conversationId")
    AND EXISTS (SELECT 1 FROM "User" p WHERE p.id = "ConversationMember"."userId"));
ALTER TABLE "ConversationMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConversationMessage"
  USING (EXISTS (SELECT 1 FROM "Conversation" p WHERE p.id = "ConversationMessage"."conversationId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Conversation" p WHERE p.id = "ConversationMessage"."conversationId"));
ALTER TABLE "DocumentApplicability" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DocumentApplicability"
  USING (EXISTS (SELECT 1 FROM "Document" p WHERE p.id = "DocumentApplicability"."documentId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Document" p WHERE p.id = "DocumentApplicability"."documentId")
    AND EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "DocumentApplicability"."productId")
    AND ("DocumentApplicability"."deviceId" IS NULL OR EXISTS (SELECT 1 FROM "Device" p WHERE p.id = "DocumentApplicability"."deviceId")));
ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DocumentChunk"
  USING (EXISTS (SELECT 1 FROM "Document" p WHERE p.id = "DocumentChunk"."documentId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Document" p WHERE p.id = "DocumentChunk"."documentId"));
ALTER TABLE "ErrorRelation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ErrorRelation"
  USING (EXISTS (SELECT 1 FROM "ErrorCode" p WHERE p.id = "ErrorRelation"."errorId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "ErrorCode" p WHERE p.id = "ErrorRelation"."errorId"));
ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Feedback"
  USING (EXISTS (SELECT 1 FROM "CaseMessage" p WHERE p.id = "Feedback"."messageId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "CaseMessage" p WHERE p.id = "Feedback"."messageId"));
ALTER TABLE "HelpdeskInboundReceipt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "HelpdeskInboundReceipt"
  USING (EXISTS (SELECT 1 FROM "HelpdeskIntegration" p WHERE p.id = "HelpdeskInboundReceipt"."integrationId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "HelpdeskIntegration" p WHERE p.id = "HelpdeskInboundReceipt"."integrationId"));
ALTER TABLE "HelpdeskLink" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "HelpdeskLink"
  USING (EXISTS (SELECT 1 FROM "Ticket" p WHERE p.id = "HelpdeskLink"."ticketId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Ticket" p WHERE p.id = "HelpdeskLink"."ticketId")
    AND EXISTS (SELECT 1 FROM "HelpdeskIntegration" p WHERE p.id = "HelpdeskLink"."integrationId"));
ALTER TABLE "MessageReaction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MessageReaction"
  USING (EXISTS (SELECT 1 FROM "ConversationMessage" p WHERE p.id = "MessageReaction"."messageId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "ConversationMessage" p WHERE p.id = "MessageReaction"."messageId"));
ALTER TABLE "PasswordReset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PasswordReset"
  USING (EXISTS (SELECT 1 FROM "User" p WHERE p.id = "PasswordReset"."userId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "User" p WHERE p.id = "PasswordReset"."userId"));
ALTER TABLE "ProductRevision" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductRevision"
  USING (EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "ProductRevision"."productId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "ProductRevision"."productId"));
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Session"
  USING (EXISTS (SELECT 1 FROM "User" p WHERE p.id = "Session"."userId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "User" p WHERE p.id = "Session"."userId"));
ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Ticket"
  USING (EXISTS (SELECT 1 FROM "Case" p WHERE p.id = "Ticket"."caseId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Case" p WHERE p.id = "Ticket"."caseId"));
ALTER TABLE "TicketInfoRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TicketInfoRequest"
  USING (EXISTS (SELECT 1 FROM "Ticket" p WHERE p.id = "TicketInfoRequest"."ticketId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Ticket" p WHERE p.id = "TicketInfoRequest"."ticketId"));
ALTER TABLE "UserPresence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserPresence"
  USING (EXISTS (SELECT 1 FROM "User" p WHERE p.id = "UserPresence"."userId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "User" p WHERE p.id = "UserPresence"."userId"));

-- ─── Особените ──────────────────────────────────────────────────────────────────────────────────
-- Самият клиент: вижда се само текущият. Създава го само CLI-то (системната роля).
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tenant"
  USING (id = chatchat_tenant())
  WITH CHECK (id = chatchat_tenant());

-- Одитът: само събитията на клиента; веригата е обща, затова предишният хеш идва от
-- chatchat_audit_prev_hash() (само хеш, без съдържание). Събитие без клиент (ретенцията) пише само
-- системната роля. Приложението няма UPDATE/DELETE (по-долу) — веригата не се пипа от него.
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditEvent"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());

-- Контролните точки на веригата са глобални: RLS без политика = нищо за приложението (и без права
-- по-долу); пише ги само ретенцията (системната роля).
ALTER TABLE "AuditCheckpoint" ENABLE ROW LEVEL SECURITY;

-- ─── Тесните пътища преди клиента (SECURITY DEFINER) ────────────────────────────────────────────
-- Всяка връща САМО id на клиента (или хеш за одита) по неотгатваем ключ — нищо друго от реда. Тече
-- като собственика (без RLS), с фиксиран search_path; EXECUTE има само `chatchat_app` (хешът на
-- одита — и `chatchat_system`). След нея приложението слага клиента и чете нормално — под RLS.

-- Сесия по HMAC на токена от бисквитката (само жива: неотнета, в срок).
CREATE FUNCTION chatchat_tenant_by_session(token_hash text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT u."tenantId" FROM public."Session" s JOIN public."User" u ON u.id = s."userId"
    WHERE s."tokenHash" = token_hash AND s."revokedAt" IS NULL AND s."expiresAt" > now()
  $$;

-- Вход с парола: клиентът по имейл (уникален в платформата). Отговорът на входа остава еднакъв за
-- съществуващ и несъществуващ акаунт (dummy hash в routes/auth.ts).
CREATE FUNCTION chatchat_tenant_by_email(email text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$ SELECT u."tenantId" FROM public."User" u WHERE u.email = chatchat_tenant_by_email.email $$;

-- Линкът за парола: по HMAC на токена (само неизползван и в срок).
CREATE FUNCTION chatchat_tenant_by_reset(token_hash text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT u."tenantId" FROM public."PasswordReset" r JOIN public."User" u ON u.id = r."userId"
    WHERE r."tokenHash" = token_hash AND r."usedAt" IS NULL AND r."expiresAt" > now()
  $$;

-- Единният вход: доставчикът по домейна на имейла (само включен) и върнатият state (HMAC, неизползван
-- и в срок).
CREATE FUNCTION chatchat_tenant_by_sso_domain(domain text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT d."tenantId" FROM public."SsoDomain" d JOIN public."SsoConfig" c ON c.id = d."configId"
    WHERE d.domain = chatchat_tenant_by_sso_domain.domain AND c.enabled
  $$;

CREATE FUNCTION chatchat_tenant_by_sso_state(state_hash text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT s."tenantId" FROM public."SsoLoginState" s
    WHERE s."stateHash" = state_hash AND s."usedAt" IS NULL AND s."expiresAt" > now()
  $$;

-- Входящото известие от helpdesk-а: по идентификатора в адреса (подписът се проверява след това).
CREATE FUNCTION chatchat_tenant_by_helpdesk_inbound(inbound_id text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT h."tenantId" FROM public."HelpdeskIntegration" h
    WHERE h."inboundId" = chatchat_tenant_by_helpdesk_inbound.inbound_id
  $$;

-- Предишният хеш на ОБЩАТА одитна верига (последното събитие или котвата от контролната точка;
-- NULL → GENESIS в src/audit.ts). Вика се под advisory lock-а в транзакцията на записа.
CREATE FUNCTION chatchat_audit_prev_hash() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT COALESCE(
      (SELECT e.hash FROM public."AuditEvent" e ORDER BY e.id DESC LIMIT 1),
      (SELECT c."throughHash" FROM public."AuditCheckpoint" c ORDER BY c."throughId" DESC LIMIT 1)
    )
  $$;

-- ─── Правата на ролите ──────────────────────────────────────────────────────────────────────────
-- Ролите са на клъстера (не на базата): създава ги deploy/deploy.sh (Docker) или администраторът на
-- базата ПРЕДИ миграцията. Правата — ЕДНО място, функция в самата база: миграцията я вика сега, а
-- deploy.sh и backup-restore.sh (след --live: дъмпът се връща с --no-acl, т.е. без права) — при всеки
-- пробег. Идемпотентна; роля, която я няма, се пропуска. Бъдещите таблици на собственика получават
-- същите права автоматично (DEFAULT PRIVILEGES) — а RLS за тях иска тестът
-- tests/integration/rls-isolation.test.ts (нова таблица без политика = червен тест). Нова SECURITY
-- DEFINER функция → CREATE OR REPLACE на тази в същата миграция.
CREATE FUNCTION chatchat_apply_grants() RETURNS void
  LANGUAGE plpgsql SET search_path = public, pg_temp
  AS $$
BEGIN
  REVOKE ALL ON FUNCTION chatchat_tenant_by_session(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION chatchat_tenant_by_email(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION chatchat_tenant_by_reset(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION chatchat_tenant_by_sso_domain(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION chatchat_tenant_by_sso_state(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION chatchat_tenant_by_helpdesk_inbound(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION chatchat_audit_prev_hash() FROM PUBLIC;
  REVOKE ALL ON FUNCTION chatchat_apply_grants() FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatchat_app') THEN
    GRANT USAGE ON SCHEMA public TO chatchat_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chatchat_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chatchat_app;
    REVOKE ALL ON TABLE "_prisma_migrations" FROM chatchat_app;
    REVOKE ALL ON TABLE "AuditCheckpoint" FROM chatchat_app;
    REVOKE ALL ON SEQUENCE "AuditCheckpoint_id_seq" FROM chatchat_app;
    REVOKE UPDATE, DELETE ON TABLE "AuditEvent" FROM chatchat_app;
    REVOKE INSERT, UPDATE, DELETE ON TABLE "Tenant" FROM chatchat_app;
    GRANT EXECUTE ON FUNCTION chatchat_tenant_by_session(text) TO chatchat_app;
    GRANT EXECUTE ON FUNCTION chatchat_tenant_by_email(text) TO chatchat_app;
    GRANT EXECUTE ON FUNCTION chatchat_tenant_by_reset(text) TO chatchat_app;
    GRANT EXECUTE ON FUNCTION chatchat_tenant_by_sso_domain(text) TO chatchat_app;
    GRANT EXECUTE ON FUNCTION chatchat_tenant_by_sso_state(text) TO chatchat_app;
    GRANT EXECUTE ON FUNCTION chatchat_tenant_by_helpdesk_inbound(text) TO chatchat_app;
    GRANT EXECUTE ON FUNCTION chatchat_audit_prev_hash() TO chatchat_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatchat_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO chatchat_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatchat_system') THEN
    GRANT USAGE ON SCHEMA public TO chatchat_system;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chatchat_system;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chatchat_system;
    REVOKE ALL ON TABLE "_prisma_migrations" FROM chatchat_system;
    -- Одитът от CLI-тата и ретенцията (контролната точка) — същата верига.
    GRANT EXECUTE ON FUNCTION chatchat_audit_prev_hash() TO chatchat_system;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatchat_system;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO chatchat_system;
  END IF;
END
$$;

SELECT chatchat_apply_grants();
