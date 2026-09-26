-- Row-Level Security: изолацията по фирма слиза ПОД приложението.
--
-- Приложният филтър остава първата линия — по-бърз е и дава по-добри
-- съобщения. Това е втората: код, който утре забрави филтъра, вече не вижда
-- чужди редове, защото самият Postgres не му ги дава.
--
-- Три неща, които не са козметика:
--
--   • `IS NOT DISTINCT FROM` вместо `=`. В SQL `NULL = NULL` е NULL, а точно
--     NULL е обхватът на ЕДНОФИРМЕНАТА инсталация — най-честият случай. С
--     обикновено равенство политиката би скрила всичко.
--
--   • `FORCE ROW LEVEL SECURITY`. Без него собственикът на таблицата (а
--     приложният потребител обикновено е точно той) заобикаля политиките.
--
--   • Ролята НЕ бива да е суперпотребител. Суперпотребителят заобикаля
--     политиките безусловно, дори при FORCE — целият слой би бил украса, без
--     нищо в лога да го подскаже. Официалният образ на Postgres създава
--     `POSTGRES_USER` именно като суперпотребител, затова тук го понижаваме
--     (запазвайки CREATEDB за инструментите). Схемата не ползва разширения,
--     тоест DDL-ът на Prisma остава изпълним от собственика.
--
-- Обхватът се задава с `SET LOCAL` за всяка транзакция (`conRls` в src/lib/rls.ts).
-- Стойност '*' е нивото на доставчика (MASTER), '-' е NULL обхватът, а празната
-- стойност значи „обхват не е поискан" — политиката тогава пропуска, защото
-- Prisma не връзва връзка за цялата HTTP заявка.

DO $$
DECLARE ruolo text := current_user;
BEGIN
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = ruolo) THEN
    BEGIN
      EXECUTE format('ALTER ROLE %I NOSUPERUSER CREATEDB', ruolo);
      RAISE NOTICE 'Ролята % е понижена: RLS вече важи и за нея.', ruolo;
    EXCEPTION WHEN OTHERS THEN
      -- Postgres ОТКАЗВА да понижи bootstrap потребителя („The bootstrap user
      -- must have the SUPERUSER attribute") — а официалният образ прави точно
      -- `POSTGRES_USER` такъв. Затова не проваляме миграцията: приложението
      -- трябва да тръгне, иначе една инсталация умира на празно.
      --
      -- Но и не мълчим: суперпотребителят заобикаля политиките безусловно, тоест
      -- изолацията е УКРАСА. `GET /api/readyz` връща `rls: false` с причината,
      -- метриката `erp_rls_attiva` пада на нула и алармата `ErpRlsDisattivata`
      -- звъни. Правилният изход е приложението да върви със СВОЯ роля, а не с
      -- bootstrap-а — виж `deploy/postgres-init/` и DEPLOY.md § 7.
      RAISE WARNING 'Ролята % НЕ можа да бъде понижена (%). RLS няма да е в сила, докато приложението върви с нея.', ruolo, SQLERRM;
    END;
  END IF;
END
$$;

ALTER TABLE "dati_azienda" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dati_azienda" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dati_azienda";
CREATE POLICY tenant_isolation ON "dati_azienda"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "users";
CREATE POLICY tenant_isolation ON "users"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "audit_log";
CREATE POLICY tenant_isolation ON "audit_log"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "impianti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "impianti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "impianti";
CREATE POLICY tenant_isolation ON "impianti"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "impianti_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "impianti_media" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "impianti_media";
CREATE POLICY tenant_isolation ON "impianti_media"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "scadenze_impianti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scadenze_impianti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "scadenze_impianti";
CREATE POLICY tenant_isolation ON "scadenze_impianti"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "assegnazioni_tecnici" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assegnazioni_tecnici" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assegnazioni_tecnici";
CREATE POLICY tenant_isolation ON "assegnazioni_tecnici"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "condomini" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "condomini" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "condomini";
CREATE POLICY tenant_isolation ON "condomini"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "amministratori" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "amministratori" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "amministratori";
CREATE POLICY tenant_isolation ON "amministratori"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "dipendenti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dipendenti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dipendenti";
CREATE POLICY tenant_isolation ON "dipendenti"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "automezzi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automezzi" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "automezzi";
CREATE POLICY tenant_isolation ON "automezzi"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "cottimisti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cottimisti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cottimisti";
CREATE POLICY tenant_isolation ON "cottimisti"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "squadre" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "squadre" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "squadre";
CREATE POLICY tenant_isolation ON "squadre"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "articoli_magazzino" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "articoli_magazzino" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "articoli_magazzino";
CREATE POLICY tenant_isolation ON "articoli_magazzino"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "movimenti_magazzino" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimenti_magazzino" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "movimenti_magazzino";
CREATE POLICY tenant_isolation ON "movimenti_magazzino"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "preventivi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "preventivi" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "preventivi";
CREATE POLICY tenant_isolation ON "preventivi"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "contratti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contratti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "contratti";
CREATE POLICY tenant_isolation ON "contratti"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "ordini_lavoro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ordini_lavoro" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ordini_lavoro";
CREATE POLICY tenant_isolation ON "ordini_lavoro"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "rapportini" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rapportini" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "rapportini";
CREATE POLICY tenant_isolation ON "rapportini"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "fatture" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fatture" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fatture";
CREATE POLICY tenant_isolation ON "fatture"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "ddt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ddt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ddt";
CREATE POLICY tenant_isolation ON "ddt"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
ALTER TABLE "documenti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documenti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "documenti";
CREATE POLICY tenant_isolation ON "documenti"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
