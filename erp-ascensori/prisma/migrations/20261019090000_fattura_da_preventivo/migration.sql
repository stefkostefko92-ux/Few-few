-- Фактурата помни офертата, от която е родена: аванс и салдо са две фактури
-- на една оферта, а без връзката офертата не знае какво вече е фактурирано.
-- Добавяща промяна: нова колона с NULL, нищо съществуващо не се пипа.

-- AlterTable
ALTER TABLE "fatture" ADD COLUMN     "preventivoId" UUID;

-- CreateIndex
CREATE INDEX "fatture_preventivoId_idx" ON "fatture"("preventivoId");

-- AddForeignKey
ALTER TABLE "fatture" ADD CONSTRAINT "fatture_preventivoId_fkey" FOREIGN KEY ("preventivoId") REFERENCES "preventivi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
