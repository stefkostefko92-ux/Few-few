-- Страницата /stato (чл. 2.4 от условията, версия 2027-01-12): прекъсванията и планираната поддръжка,
-- написани от MASTER. Само добавя.
CREATE TYPE "TipoAvvisoStato" AS ENUM ('INTERRUZIONE', 'MANUTENZIONE');

CREATE TABLE "AvvisoStato" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAvvisoStato" NOT NULL,
    "titolo" VARCHAR(160) NOT NULL,
    "testo" VARCHAR(2000) NOT NULL,
    "inizio" TIMESTAMP(3) NOT NULL,
    "fine" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvvisoStato_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AvvisoStato_inizio_idx" ON "AvvisoStato"("inizio");
CREATE INDEX "AvvisoStato_createdById_idx" ON "AvvisoStato"("createdById");

ALTER TABLE "AvvisoStato" ADD CONSTRAINT "AvvisoStato_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Заглавието и текстът не са празни; краят — след началото; планираната поддръжка има край.
ALTER TABLE "AvvisoStato" ADD CONSTRAINT "AvvisoStato_check" CHECK (
  length(btrim("titolo")) > 0
  AND length(btrim("testo")) > 0
  AND ("fine" IS NULL OR "fine" > "inizio")
  AND ("tipo" = 'INTERRUZIONE' OR "fine" IS NOT NULL)
);
