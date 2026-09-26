-- Поканите за плащане.
--
-- Записът е ДОКАЗАТЕЛСТВОТО, че поканата е тръгнала: при спор се пита кога и
-- какво е поискано. Затова таблицата е само за добавяне — маршрути за промяна
-- и изтриване няма, точно както при одита.
--
-- Лихвата се ЗАМРАЗЯВА в момента на изпращането (`interessiCentesimi`).
-- Пресмятане наново по-късно би дало друго число от това, което клиентът е
-- получил на хартия — а различаващи се числа в спор за пари са по-лоши от
-- липсващи.

-- CreateTable
CREATE TABLE "solleciti" (
    "id" UUID NOT NULL,
    "fatturaId" UUID NOT NULL,
    "livello" INTEGER NOT NULL,
    "giorniRitardo" INTEGER NOT NULL,
    "importoCentesimi" INTEGER NOT NULL,
    "interessiCentesimi" INTEGER NOT NULL DEFAULT 0,
    "canale" TEXT,
    "note" TEXT,
    "utenteId" UUID,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solleciti_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solleciti_tenantId_idx" ON "solleciti"("tenantId");

-- CreateIndex
CREATE INDEX "solleciti_fatturaId_idx" ON "solleciti"("fatturaId");

-- AddForeignKey
ALTER TABLE "solleciti" ADD CONSTRAINT "solleciti_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "fatture"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Изолацията по фирма — същата политика като на другите таблици.
ALTER TABLE "solleciti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "solleciti" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "solleciti";
CREATE POLICY tenant_isolation ON "solleciti"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
