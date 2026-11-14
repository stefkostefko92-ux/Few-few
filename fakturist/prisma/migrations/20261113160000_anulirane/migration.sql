-- Анулиране (SPEC 47): новият документ на мястото на анулирания и кой е анулирал. Само добавя.
-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "replacedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_replacedById_key" ON "Document"("replacedById");

-- CreateIndex
CREATE INDEX "Document_cancelledById_idx" ON "Document"("cancelledById");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

