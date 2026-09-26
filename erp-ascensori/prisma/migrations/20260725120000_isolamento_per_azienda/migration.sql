-- Изолация по фирма: одитът получава `tenantId`, а бизнес-ключовете стават
-- уникални В РАМКИТЕ НА ФИРМАТА, не глобално.
--
-- Защо не може да чака: с глобален `numero @unique` втората фирма получава
-- следващия свободен номер СЛЕД първата — регистърът ѝ има дупки, а самият
-- номер издава колко документа е издал съседът (чл. 21, ал. 2, б. „б"
-- D.P.R. 633/1972 иска номерацията да е на данъчнозадълженото лице).
-- Без `tenantId` в `audit_log` регистърът изобщо не може да се филтрира.

-- DropIndex
DROP INDEX "articoli_magazzino_codice_key";

-- DropIndex
DROP INDEX "automezzi_targa_key";

-- DropIndex
DROP INDEX "ddt_numero_key";

-- DropIndex
DROP INDEX "fatture_numero_key";

-- DropIndex
DROP INDEX "impianti_matricola_key";

-- DropIndex
DROP INDEX "ordini_lavoro_numero_key";

-- DropIndex
DROP INDEX "preventivi_numero_key";

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "tenantId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "articoli_magazzino_tenantId_codice_key" ON "articoli_magazzino"("tenantId", "codice");

-- CreateIndex
CREATE INDEX "audit_log_tenantId_createdAt_idx" ON "audit_log"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "automezzi_tenantId_targa_key" ON "automezzi"("tenantId", "targa");

-- CreateIndex
CREATE UNIQUE INDEX "ddt_tenantId_numero_key" ON "ddt"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "fatture_tenantId_numero_key" ON "fatture"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "impianti_tenantId_matricola_key" ON "impianti"("tenantId", "matricola");

-- CreateIndex
CREATE UNIQUE INDEX "ordini_lavoro_tenantId_numero_key" ON "ordini_lavoro"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "preventivi_tenantId_numero_key" ON "preventivi"("tenantId", "numero");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

