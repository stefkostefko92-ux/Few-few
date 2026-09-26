-- Вложените материали по отчет.
--
-- Дотук вложеното живееше като свободен текст и наличността не мърдаше. Тук
-- редът и складовото движение стават НЕРАЗДЕЛНИ: `movimentoId` е NOT NULL и
-- UNIQUE, тоест ред без движение е невъзможен по схема, а не по добра воля на
-- маршрута. Обратното също: едно движение не може да обслужи два реда.

-- CreateTable
CREATE TABLE "materiali_rapportino" (
    "id" UUID NOT NULL,
    "rapportinoId" UUID NOT NULL,
    "articoloId" UUID NOT NULL,
    "quantita" INTEGER NOT NULL,
    "movimentoId" UUID NOT NULL,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materiali_rapportino_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "materiali_rapportino_movimentoId_key" ON "materiali_rapportino"("movimentoId");

-- CreateIndex
CREATE INDEX "materiali_rapportino_tenantId_idx" ON "materiali_rapportino"("tenantId");

-- CreateIndex
CREATE INDEX "materiali_rapportino_rapportinoId_idx" ON "materiali_rapportino"("rapportinoId");

-- AddForeignKey
ALTER TABLE "materiali_rapportino" ADD CONSTRAINT "materiali_rapportino_rapportinoId_fkey" FOREIGN KEY ("rapportinoId") REFERENCES "rapportini"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiali_rapportino" ADD CONSTRAINT "materiali_rapportino_articoloId_fkey" FOREIGN KEY ("articoloId") REFERENCES "articoli_magazzino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiali_rapportino" ADD CONSTRAINT "materiali_rapportino_movimentoId_fkey" FOREIGN KEY ("movimentoId") REFERENCES "movimenti_magazzino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Изолацията по фирма: същата политика като на другите 30 таблици.
-- Без нея новата таблица би била единствената, през която се минава свободно.
ALTER TABLE "materiali_rapportino" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "materiali_rapportino" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "materiali_rapportino";
CREATE POLICY tenant_isolation ON "materiali_rapportino"
  USING (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  )
  WITH CHECK (
    coalesce((SELECT current_setting('app.tenant_id', true)), '') IN ('', '*')
    OR "tenantId" IS NOT DISTINCT FROM (SELECT nullif(nullif(nullif(current_setting('app.tenant_id', true), '-'), ''), '*')::uuid)
  );
