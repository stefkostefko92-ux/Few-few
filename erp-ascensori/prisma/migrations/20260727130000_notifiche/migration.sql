-- Изходящи известия за срокове — опашка + настройки по фирма.
--
-- Дотук автоматизмът вдигаше флаг и таблото го показваше. Флаг, който никой не
-- отваря, не е известие: срокът по чл. 13 D.P.R. 162/1999 минава, докато
-- уредбата работи и никой не гледа екрана.
--
-- Опашка, а не изпращане на място — по същата причина, по която webhook-ите са
-- опашка: паднало пощенско реле не бива да проваля пуска на автоматизма.

CREATE TYPE "TipoNotifica" AS ENUM (
  'SCADENZA_IMPIANTO',
  'SCADENZA_AUTOMEZZO',
  'FATTURA_SCADUTA',
  'PREVENTIVO_SCADUTO'
);

CREATE TYPE "StatoNotifica" AS ENUM ('IN_ATTESA', 'INVIATA', 'FALLITA');

-- `id` е БЕЗ `DEFAULT gen_random_uuid()` и това не е пропуск: `@default(uuid())`
-- в Prisma се изпълнява в ПРИЛОЖЕНИЕТО, не в базата. Първата версия на тази
-- миграция сложи default в SQL-а и гейтът „дрейф между схема и миграции" я
-- отхвърли — точно за това съществува: историята на миграциите трябва да
-- изгражда живата схема ДОСЛОВНО, иначе поправката се прави с ръчен SQL върху
-- продукционна база. Всички останали 39 таблици са същите.
CREATE TABLE "notifiche" (
  "id"                UUID            NOT NULL,
  "tipo"              "TipoNotifica"  NOT NULL,
  "chiave"            TEXT            NOT NULL,
  "destinatario"      TEXT            NOT NULL,
  "oggetto"           TEXT            NOT NULL,
  "corpo"             TEXT            NOT NULL,
  "stato"             "StatoNotifica" NOT NULL DEFAULT 'IN_ATTESA',
  "tentativi"         INTEGER         NOT NULL DEFAULT 0,
  "prossimoTentativo" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inviataAt"         TIMESTAMP(3),
  "ultimoErrore"      TEXT,
  "tenantId"          UUID,
  "createdAt"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)    NOT NULL,
  CONSTRAINT "notifiche_pkey" PRIMARY KEY ("id")
);

-- Идемпотентността е ТУК, в базата, не в кода: два едновременни пуска на
-- автоматизма (cron + ръчно натискане) иначе пращат едно и също известие два
-- пъти, и получателят спира да им вярва.
CREATE UNIQUE INDEX "notifiche_tenantId_chiave_destinatario_key"
  ON "notifiche" ("tenantId", "chiave", "destinatario");

-- Опашката се чете само по този въпрос: „кои чакат и времето им е дошло".
CREATE INDEX "notifiche_stato_prossimoTentativo_idx"
  ON "notifiche" ("stato", "prossimoTentativo");
CREATE INDEX "notifiche_tenantId_idx" ON "notifiche" ("tenantId");

-- Настройки по фирма: кой получава и включено ли е изобщо.
ALTER TABLE "dati_azienda" ADD COLUMN "emailAvvisi" TEXT;
ALTER TABLE "dati_azienda"
  ADD COLUMN "avvisiAttivi" BOOLEAN NOT NULL DEFAULT false;

-- RLS — новата таблица влиза в същия режим като останалите 31. Без този блок
-- `/api/readyz` би върнал `rls: false` и `autodeploy.sh` би отказал релийза;
-- по-важното е, че опашката носи адреси на клиента.
ALTER TABLE "notifiche" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifiche" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "notifiche";
CREATE POLICY tenant_isolation ON "notifiche"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
