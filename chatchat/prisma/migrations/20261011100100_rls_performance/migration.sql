-- Производителността под RLS (миграцията 20261011100000) — измерено (доклад на потока R1):
--
-- 1) DocumentChunk.tenantId: пълнотекстовото търсене минава през всички парчета на клиента; с
--    политика „видим документ“ (EXISTS на ред) това струваше +25…35 % на търсенето, с равенство по
--    колона — +8 %. Клиентът на парчето е денормализиран; съставният външен ключ (documentId,
--    tenantId) → Document(id, tenantId) пази, че е ВИНАГИ клиентът на документа.
-- 2) Търсенето в историята (FR-16): под RLS PostgreSQL не ползва GIN индекса за `@@` (операторът не е
--    leakproof и не може да се изпълни преди политиката) — заявката минаваше през всички съобщения
--    на клиента (13 ms → 860 ms при 100 000 съобщения). Кандидатите по индекса дава тясна SECURITY
--    DEFINER функция: САМО id-та на съобщенията на ТЕКУЩИЯ клиент (от контекста, никога параметър);
--    достъпът (членство, роли, аудитории) и съдържанието — в заявката на приложението, под RLS.

-- ─── 1. Клиентът на парчето ────────────────────────────────────────────────────────────────────
ALTER TABLE "DocumentChunk" DROP CONSTRAINT "DocumentChunk_documentId_fkey";

ALTER TABLE "DocumentChunk" ADD COLUMN "tenantId" TEXT;
UPDATE "DocumentChunk" c SET "tenantId" = d."tenantId" FROM "Document" d WHERE d.id = c."documentId";
ALTER TABLE "DocumentChunk" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE UNIQUE INDEX "Document_id_tenantId_key" ON "Document"("id", "tenantId");

ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_tenantId_fkey" FOREIGN KEY ("documentId", "tenantId") REFERENCES "Document"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Без индекс само по "tenantId": търсенията вървят от документите на клиента (documentId) — индекс по
-- клиента би подмамил плановика да обхожда всички парчета на клиента за точните съвпадения.
ALTER POLICY tenant_isolation ON "DocumentChunk"
  USING ("tenantId" = chatchat_tenant())
  WITH CHECK ("tenantId" = chatchat_tenant());

-- ─── 2. Кандидатите за търсенето в историята ───────────────────────────────────────────────────
CREATE FUNCTION chatchat_search_conversation_messages(q tsquery) RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  ROWS 200
  AS $$
    SELECT m.id FROM public."ConversationMessage" m
      JOIN public."Conversation" c ON c.id = m."conversationId"
     WHERE m.tsv @@ q AND m."deletedAt" IS NULL AND c."tenantId" = public.chatchat_tenant()
  $$;

CREATE FUNCTION chatchat_search_case_messages(q tsquery) RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  ROWS 200
  AS $$
    SELECT m.id FROM public."CaseMessage" m
      JOIN public."Case" k ON k.id = m."caseId"
     WHERE m.tsv @@ q AND k."tenantId" = public.chatchat_tenant()
  $$;

-- Правата — същото едно място (нови функции → нова версия на chatchat_apply_grants).
CREATE OR REPLACE FUNCTION chatchat_apply_grants() RETURNS void
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
  REVOKE ALL ON FUNCTION chatchat_search_conversation_messages(tsquery) FROM PUBLIC;
  REVOKE ALL ON FUNCTION chatchat_search_case_messages(tsquery) FROM PUBLIC;
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
    GRANT EXECUTE ON FUNCTION chatchat_search_conversation_messages(tsquery) TO chatchat_app;
    GRANT EXECUTE ON FUNCTION chatchat_search_case_messages(tsquery) TO chatchat_app;
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
