-- Одобрението на картите, версиите им, адресникът на доставчиците и пратените поръчки. Само добавя.

-- CreateEnum
CREATE TYPE "StatoApprovazione" AS ENUM ('BOZZA', 'INVIATA', 'APPROVATA', 'RESPINTA');

-- CreateEnum
CREATE TYPE "StatoOrdine" AS ENUM ('INVIATO', 'CONFERMATO', 'ANNULLATO');

-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "approvazioneSchede" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "approvazioneAt" TIMESTAMP(3),
ADD COLUMN     "approvazioneDaId" TEXT,
ADD COLUMN     "notaApprovazione" VARCHAR(1000),
ADD COLUMN     "statoApprovazione" "StatoApprovazione";

-- CreateTable
CREATE TABLE "SchedaVersione" (
    "id" TEXT NOT NULL,
    "schedaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoreId" TEXT,
    "dati" JSONB NOT NULL,

    CONSTRAINT "SchedaVersione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornitore" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fornitore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdineFornitore" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "schedaId" TEXT NOT NULL,
    "modulo" VARCHAR(60) NOT NULL,
    "destinatarioNome" VARCHAR(120) NOT NULL,
    "destinatarioEmail" VARCHAR(254) NOT NULL,
    "messaggio" VARCHAR(2000),
    "stato" "StatoOrdine" NOT NULL DEFAULT 'INVIATO',
    "inviatoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviatoDaId" TEXT,
    "confermatoAt" TIMESTAMP(3),
    "nota" VARCHAR(1000),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdineFornitore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchedaVersione_autoreId_idx" ON "SchedaVersione"("autoreId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedaVersione_schedaId_numero_key" ON "SchedaVersione"("schedaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Fornitore_aziendaId_email_key" ON "Fornitore"("aziendaId", "email");

-- CreateIndex
CREATE INDEX "OrdineFornitore_aziendaId_stato_idx" ON "OrdineFornitore"("aziendaId", "stato");

-- CreateIndex
CREATE INDEX "OrdineFornitore_schedaId_idx" ON "OrdineFornitore"("schedaId");

-- CreateIndex
CREATE INDEX "OrdineFornitore_inviatoDaId_idx" ON "OrdineFornitore"("inviatoDaId");

-- CreateIndex
CREATE INDEX "Scheda_aziendaId_statoApprovazione_idx" ON "Scheda"("aziendaId", "statoApprovazione");

-- CreateIndex
CREATE INDEX "Scheda_approvazioneDaId_idx" ON "Scheda"("approvazioneDaId");

-- AddForeignKey
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_approvazioneDaId_fkey" FOREIGN KEY ("approvazioneDaId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedaVersione" ADD CONSTRAINT "SchedaVersione_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedaVersione" ADD CONSTRAINT "SchedaVersione_autoreId_fkey" FOREIGN KEY ("autoreId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fornitore" ADD CONSTRAINT "Fornitore_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdineFornitore" ADD CONSTRAINT "OrdineFornitore_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdineFornitore" ADD CONSTRAINT "OrdineFornitore_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdineFornitore" ADD CONSTRAINT "OrdineFornitore_inviatoDaId_fkey" FOREIGN KEY ("inviatoDaId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Одобрена карта знае кой и кога; върнатата — защо.
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_approvazione_check" CHECK (
  "statoApprovazione" IS DISTINCT FROM 'APPROVATA' OR "approvazioneAt" IS NOT NULL
);
ALTER TABLE "SchedaVersione" ADD CONSTRAINT "SchedaVersione_numero_check" CHECK ("numero" > 0);
