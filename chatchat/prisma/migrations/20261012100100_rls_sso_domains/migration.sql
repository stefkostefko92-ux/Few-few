-- Доказаните SSO домейни (миграцията 20261011110000_sso_hardening) под RLS (20261011100000). След
-- втвърдяването `SsoDomain.domain` вече НЕ е уникален (няколко доставчика могат да заявят домейн,
-- доказва го само един — `verifiedDomain`), а доказаният домейн е уникален в ЦЯЛАТА платформа:
--
-- 1) Откриването при вход — само по ДОКАЗАНИЯ домейн (иначе недоказана заявка на чужд клиент би
--    върнала неговия клиент: функцията връща един ред от няколко).
-- 2) „Доказан ли е от друг доставчик?“ (заявка/доказване) — само да/не, през всички клиенти.
-- 3) Доказаният домейн освобождава недоказаните заявки на другите клиенти — само за ред, доказан в
--    ТЕКУЩИЯ клиент (контекстът); връща клиента и доставчика на изтритите (за одита в техния клиент).
-- Всяка — SECURITY DEFINER, фиксиран search_path, без EXECUTE за PUBLIC.

CREATE OR REPLACE FUNCTION chatchat_tenant_by_sso_domain(domain text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT d."tenantId" FROM public."SsoDomain" d JOIN public."SsoConfig" c ON c.id = d."configId"
    WHERE d."verifiedDomain" = chatchat_tenant_by_sso_domain.domain AND c.enabled
  $$;

CREATE FUNCTION chatchat_sso_domains_taken(domains text[], config_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public."SsoDomain" d
      WHERE d."verifiedDomain" = ANY (domains) AND d."configId" <> config_id
    )
  $$;

CREATE FUNCTION chatchat_sso_release_claims(keep_id text) RETURNS TABLE (tenant_id text, config_id text)
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    DELETE FROM public."SsoDomain" d
     USING public."SsoDomain" k
     WHERE k.id = keep_id AND k."verifiedDomain" IS NOT NULL
       AND k."tenantId" = public.chatchat_tenant()
       AND d.domain = k."verifiedDomain" AND d.id <> k.id AND d."verifiedAt" IS NULL
    RETURNING d."tenantId", d."configId"
  $$;

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
  REVOKE ALL ON FUNCTION chatchat_sso_domains_taken(text[], text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION chatchat_sso_release_claims(text) FROM PUBLIC;
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
    GRANT EXECUTE ON FUNCTION chatchat_sso_domains_taken(text[], text) TO chatchat_app;
    GRANT EXECUTE ON FUNCTION chatchat_sso_release_claims(text) TO chatchat_app;
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
    -- Аварийното доказване на домейн от CLI (sso:verify-domain) — същото освобождаване на заявките.
    GRANT EXECUTE ON FUNCTION chatchat_sso_release_claims(text) TO chatchat_system;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatchat_system;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO chatchat_system;
  END IF;
END
$$;

SELECT chatchat_apply_grants();
