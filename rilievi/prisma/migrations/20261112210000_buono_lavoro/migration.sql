-- „Buono di lavoro“: листът, подписите му (по избор, вързани за подписаното) и кодът и клаузата на
-- фирмата в настройките. Само добавя.

-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "buonoClausola" VARCHAR(1000),
ADD COLUMN     "buonoCodice" VARCHAR(80);

-- CreateTable
CREATE TABLE "BuonoLavoro" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "schedaId" TEXT,
    "numero" VARCHAR(40),
    "dataConferma" DATE,
    "geometra" VARCHAR(80),
    "ordine" VARCHAR(40),
    "offerta" VARCHAR(40),
    "inizioPrevisto" DATE,
    "finePrevista" DATE,
    "matricola" VARCHAR(40),
    "ubicazione" VARCHAR(200),
    "pos" BOOLEAN,
    "note" VARCHAR(4000),
    "sequenze" JSONB NOT NULL DEFAULT '[]',
    "controlli" JSONB NOT NULL DEFAULT '{}',
    "noteControlli" VARCHAR(4000),
    "inizioLavori" DATE,
    "inizioOra" VARCHAR(5),
    "fineLavori" DATE,
    "fineOra" VARCHAR(5),
    "sospensioni" VARCHAR(4000),
    "tecnici" VARCHAR(200),
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuonoLavoro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuonoFirma" (
    "id" TEXT NOT NULL,
    "buonoId" TEXT NOT NULL,
    "posto" VARCHAR(24) NOT NULL,
    "tratti" JSONB NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "impronta" CHAR(64) NOT NULL,
    "sigillo" CHAR(64) NOT NULL,
    "firmatoAt" TIMESTAMP(3) NOT NULL,
    "firmatoDaId" TEXT,

    CONSTRAINT "BuonoFirma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuonoLavoro_aziendaId_createdAt_idx" ON "BuonoLavoro"("aziendaId", "createdAt");

-- CreateIndex
CREATE INDEX "BuonoLavoro_schedaId_createdAt_idx" ON "BuonoLavoro"("schedaId", "createdAt");

-- CreateIndex
CREATE INDEX "BuonoLavoro_createdById_idx" ON "BuonoLavoro"("createdById");

-- CreateIndex
CREATE INDEX "BuonoLavoro_updatedById_idx" ON "BuonoLavoro"("updatedById");

-- CreateIndex
CREATE INDEX "BuonoFirma_hash_idx" ON "BuonoFirma"("hash");

-- CreateIndex
CREATE INDEX "BuonoFirma_firmatoDaId_idx" ON "BuonoFirma"("firmatoDaId");

-- CreateIndex
CREATE UNIQUE INDEX "BuonoFirma_buonoId_posto_key" ON "BuonoFirma"("buonoId", "posto");

-- AddForeignKey
ALTER TABLE "BuonoLavoro" ADD CONSTRAINT "BuonoLavoro_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuonoLavoro" ADD CONSTRAINT "BuonoLavoro_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuonoLavoro" ADD CONSTRAINT "BuonoLavoro_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuonoLavoro" ADD CONSTRAINT "BuonoLavoro_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuonoFirma" ADD CONSTRAINT "BuonoFirma_buonoId_fkey" FOREIGN KEY ("buonoId") REFERENCES "BuonoLavoro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuonoFirma" ADD CONSTRAINT "BuonoFirma_firmatoDaId_fkey" FOREIGN KEY ("firmatoDaId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Търсенето в списъка (номер, матрикула, място…) — като картите.
CREATE INDEX "BuonoLavoro_searchText_idx" ON "BuonoLavoro" USING GIN ("searchText" gin_trgm_ops);

-- Редовете — масив, проверките — обект; часовете — „HH:MM“.
ALTER TABLE "BuonoLavoro" ADD CONSTRAINT "BuonoLavoro_json_check" CHECK (
  jsonb_typeof("sequenze") = 'array' AND jsonb_typeof("controlli") = 'object'
);
ALTER TABLE "BuonoLavoro" ADD CONSTRAINT "BuonoLavoro_ore_check" CHECK (
  ("inizioOra" IS NULL OR "inizioOra" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND ("fineOra" IS NULL OR "fineOra" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

-- Мястото на подписа и трите отпечатъка (шестнадесетични, 64 знака).
ALTER TABLE "BuonoFirma" ADD CONSTRAINT "BuonoFirma_posto_check" CHECK (
  "posto" ~ '^(s-[0-9a-f]{8}|c-[A-Za-z]{1,20}|f-[A-Za-z]{1,20})$'
);
ALTER TABLE "BuonoFirma" ADD CONSTRAINT "BuonoFirma_hex_check" CHECK (
  "hash" ~ '^[0-9a-f]{64}$' AND "impronta" ~ '^[0-9a-f]{64}$' AND "sigillo" ~ '^[0-9a-f]{64}$'
);
