-- Табелата „Avviso di fermo impianto“, попълнена от картата на уредбата: връзката (по избор). Окончателно
-- изтритата карта оставя табелата без връзка. Само добавя.

-- AlterTable
ALTER TABLE "Cartello" ADD COLUMN     "schedaId" TEXT;

-- CreateIndex
CREATE INDEX "Cartello_schedaId_createdAt_idx" ON "Cartello"("schedaId", "createdAt");

-- AddForeignKey
ALTER TABLE "Cartello" ADD CONSTRAINT "Cartello_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

