-- Октомври 2026 (22-ри): скицникът в края на картата — листове, нарисувани на ръка. Фирмата го получава
-- от MASTER (по подразбиране не); картата пази дали скиците влизат в печата и PDF-а (по подразбиране да);
-- листовете са в своя таблица и падат с картата. Само добавя — предишният код не чете нищо от това.

-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "schizzi" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "schizziStampati" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Schizzo" (
    "id" TEXT NOT NULL,
    "schedaId" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,
    "elementi" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schizzo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Schizzo_schedaId_ordine_key" ON "Schizzo"("schedaId", "ordine");

-- AddForeignKey
ALTER TABLE "Schizzo" ADD CONSTRAINT "Schizzo_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
