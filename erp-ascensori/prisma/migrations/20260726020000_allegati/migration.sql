-- Прикачени файлове — първото истинско съхранение в продукта.
--
-- Дотук `impianti_media.url` пазеше ПЪТ към нещо, което не съществува: полето
-- обещаваше документи, а зад него нямаше нищо. Сега файлът наистина се
-- съхранява, а редът тук е указателят към него.
--
-- Две неща следват от това и са в `DEPLOY.md`:
--   • появява се том, който ТРЯБВА да влиза в бекъпа — база без файловете е
--     половин архив, а протоколът от проверката е доказателство;
--   • коренът на хранилището е ИЗВЪН публичната папка: под `public/` всеки
--     качен сертификат би бил свободно достъпен на познат адрес.

-- CreateTable
CREATE TABLE "allegati" (
    "id" UUID NOT NULL,
    "entita" TEXT NOT NULL,
    "entitaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "dimensione" INTEGER NOT NULL,
    "percorso" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "utenteId" UUID,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allegati_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "allegati_tenantId_idx" ON "allegati"("tenantId");

-- CreateIndex
CREATE INDEX "allegati_entita_entitaId_idx" ON "allegati"("entita", "entitaId");


-- ── Row-Level Security ────────────────────────────────────────────────────
ALTER TABLE "allegati" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "allegati" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "allegati";
CREATE POLICY tenant_isolation ON "allegati"
  USING (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
  );
