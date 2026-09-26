-- Политиката за изолация вече не разваля плана на заявките.
--
-- Условието е ЛОГИЧЕСКИ същото; сменят се само две неща в записа му.
--
-- 1. ОБВИВАНЕ В ПОДЗАЯВКА. `current_setting()` е STABLE, но планировчикът не
--    знае стойността ѝ при планиране и слага селективност по подразбиране.
--    Обвита в `(SELECT …)` тя става InitPlan: смята се веднъж и се третира
--    като константа при оценката.
--
-- 2. ПРИВЕЖДА СЕ НАСТРОЙКАТА, НЕ КОЛОНАТА. Привеждането на колоната изхвърля
--    статистиката ѝ — Postgres пази хистограма за `tenantId` като uuid, не
--    като текст.
--
-- Заедно: планировчикът очакваше 80 реда там, където имаше 10 000, и заради
-- това избираше последователно сканиране пред индекса. Тоест политиката за
-- СИГУРНОСТ мълчаливо разваляше плана на ВСЯКА заявка по таблиците с изолация.
--
-- Измерено (`npm run misura:scala`, 50 000 фактури, филтър по статус в SDI):
--   24,3 ms и оценка 80 реда  →  0,15 ms и оценка 4042 при 4000 реални.
--
-- Трите `nullif` махат сентинелите ПРЕДИ привеждането: SQL не гарантира, че
-- `OR` къса отляво, тоест дясната страна може да бъде сметната и когато лявата
-- е истина — а `''::uuid` би хвърлило грешка.
--
-- Таблицата на истинност е дословно същата: при обхват `''`/`'*'` дясната
-- страна дава NULL вместо винаги-лъжа, но лявата и без това е истина. При
-- `'-'` и при истински uuid — непроменено. Тестовете в
-- `tests/integration/rls-catena.int.test.ts` го проверяват отвън.

ALTER TABLE "dati_azienda" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dati_azienda" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dati_azienda";
CREATE POLICY tenant_isolation ON "dati_azienda"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "users";
CREATE POLICY tenant_isolation ON "users"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "audit_log";
CREATE POLICY tenant_isolation ON "audit_log"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "impianti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "impianti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "impianti";
CREATE POLICY tenant_isolation ON "impianti"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "impianti_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "impianti_media" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "impianti_media";
CREATE POLICY tenant_isolation ON "impianti_media"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "allegati" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "allegati" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "allegati";
CREATE POLICY tenant_isolation ON "allegati"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "verifiche_impianti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verifiche_impianti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "verifiche_impianti";
CREATE POLICY tenant_isolation ON "verifiche_impianti"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "scadenze_impianti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scadenze_impianti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "scadenze_impianti";
CREATE POLICY tenant_isolation ON "scadenze_impianti"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "assegnazioni_tecnici" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assegnazioni_tecnici" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assegnazioni_tecnici";
CREATE POLICY tenant_isolation ON "assegnazioni_tecnici"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "condomini" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "condomini" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "condomini";
CREATE POLICY tenant_isolation ON "condomini"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "amministratori" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "amministratori" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "amministratori";
CREATE POLICY tenant_isolation ON "amministratori"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "dipendenti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dipendenti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dipendenti";
CREATE POLICY tenant_isolation ON "dipendenti"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "automezzi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automezzi" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "automezzi";
CREATE POLICY tenant_isolation ON "automezzi"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "cottimisti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cottimisti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cottimisti";
CREATE POLICY tenant_isolation ON "cottimisti"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "squadre" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "squadre" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "squadre";
CREATE POLICY tenant_isolation ON "squadre"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "articoli_magazzino" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "articoli_magazzino" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "articoli_magazzino";
CREATE POLICY tenant_isolation ON "articoli_magazzino"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "movimenti_magazzino" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimenti_magazzino" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "movimenti_magazzino";
CREATE POLICY tenant_isolation ON "movimenti_magazzino"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "preventivi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "preventivi" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "preventivi";
CREATE POLICY tenant_isolation ON "preventivi"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "contratti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contratti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "contratti";
CREATE POLICY tenant_isolation ON "contratti"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "ordini_lavoro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ordini_lavoro" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ordini_lavoro";
CREATE POLICY tenant_isolation ON "ordini_lavoro"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "rapportini" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rapportini" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "rapportini";
CREATE POLICY tenant_isolation ON "rapportini"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "fatture" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fatture" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fatture";
CREATE POLICY tenant_isolation ON "fatture"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "pagamenti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pagamenti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pagamenti";
CREATE POLICY tenant_isolation ON "pagamenti"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "notifiche_sdi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifiche_sdi" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "notifiche_sdi";
CREATE POLICY tenant_isolation ON "notifiche_sdi"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "contatori_sdi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contatori_sdi" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "contatori_sdi";
CREATE POLICY tenant_isolation ON "contatori_sdi"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "ddt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ddt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ddt";
CREATE POLICY tenant_isolation ON "ddt"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "documenti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documenti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "documenti";
CREATE POLICY tenant_isolation ON "documenti"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "api_keys";
CREATE POLICY tenant_isolation ON "api_keys"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "webhooks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhooks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "webhooks";
CREATE POLICY tenant_isolation ON "webhooks"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
ALTER TABLE "webhook_consegne" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_consegne" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "webhook_consegne";
CREATE POLICY tenant_isolation ON "webhook_consegne"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
