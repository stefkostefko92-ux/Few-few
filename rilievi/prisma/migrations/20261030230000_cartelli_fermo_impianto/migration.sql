-- Табелата „Avviso di fermo impianto“ (собственикът, 30 октомври 2026): данните на фирмата и избраният
-- шаблон в настройките ѝ, и самите табели. Само добавя — нищо от досегашното не се пипа.

-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "cartelloModello" VARCHAR(40),
ADD COLUMN     "datiSocietari" JSONB;

-- CreateTable
CREATE TABLE "Cartello" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "indirizzo" VARCHAR(200),
    "citta" VARCHAR(80),
    "ubicazione" VARCHAR(120),
    "testo" VARCHAR(600) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cartello_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cartello_aziendaId_createdAt_idx" ON "Cartello"("aziendaId", "createdAt");

-- CreateIndex
CREATE INDEX "Cartello_createdById_idx" ON "Cartello"("createdById");

-- CreateIndex
CREATE INDEX "Cartello_updatedById_idx" ON "Cartello"("updatedById");

-- AddForeignKey
ALTER TABLE "Cartello" ADD CONSTRAINT "Cartello_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cartello" ADD CONSTRAINT "Cartello_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cartello" ADD CONSTRAINT "Cartello_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

