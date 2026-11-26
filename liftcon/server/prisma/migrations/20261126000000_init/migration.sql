-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Ruolo" AS ENUM ('MASTER', 'ADMIN', 'DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE', 'CLIENTE');

-- CreateEnum
CREATE TYPE "StatoRichiesta" AS ENUM ('NUOVA', 'IN_LAVORAZIONE', 'PROPOSTA_INVIATA', 'INCARICO', 'CHIUSA');

-- CreateEnum
CREATE TYPE "StatoSessione" AS ENUM ('PARZIALE', 'COMPLETA');

-- CreateTable
CREATE TABLE "Utente" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "ruolo" "Ruolo" NOT NULL,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "cambiarePassword" BOOLEAN NOT NULL DEFAULT false,
    "totpSecretEnc" TEXT,
    "totpAttivaDal" TIMESTAMP(3),
    "totpUltimoPasso" INTEGER,
    "codiciRecupero" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tentativiFalliti" INTEGER NOT NULL DEFAULT 0,
    "bloccatoFino" TIMESTAMP(3),
    "ultimoAccesso" TIMESTAMP(3),
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Utente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessione" (
    "id" TEXT NOT NULL,
    "utenteId" TEXT NOT NULL,
    "stato" "StatoSessione" NOT NULL,
    "csrf" TEXT NOT NULL,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scadeIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sessione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Richiesta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT NOT NULL DEFAULT '',
    "ruolo" TEXT NOT NULL,
    "comune" TEXT NOT NULL,
    "servizio" TEXT NOT NULL,
    "messaggio" TEXT NOT NULL,
    "stato" "StatoRichiesta" NOT NULL DEFAULT 'NUOVA',
    "note" TEXT NOT NULL DEFAULT '',
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornataIl" TIMESTAMP(3) NOT NULL,
    "eliminareDopo" TIMESTAMP(3),

    CONSTRAINT "Richiesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contenuto" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dati" JSONB NOT NULL,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,
    "autoreId" TEXT,

    CONSTRAINT "Contenuto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisioneContenuto" (
    "id" TEXT NOT NULL,
    "contenutoId" TEXT NOT NULL,
    "dati" JSONB NOT NULL,
    "autoreId" TEXT,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisioneContenuto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pubblicazione" (
    "id" TEXT NOT NULL,
    "iniziataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finitaIl" TIMESTAMP(3),
    "esito" TEXT NOT NULL,
    "errore" TEXT,
    "versione" TEXT,
    "autoreId" TEXT,

    CONSTRAINT "Pubblicazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utenteId" TEXT,
    "azione" TEXT NOT NULL,
    "oggetto" TEXT,
    "dettagli" JSONB,
    "ipHmac" TEXT,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utente_email_key" ON "Utente"("email");

-- CreateIndex
CREATE INDEX "Sessione_utenteId_idx" ON "Sessione"("utenteId");

-- CreateIndex
CREATE INDEX "Sessione_scadeIl_idx" ON "Sessione"("scadeIl");

-- CreateIndex
CREATE INDEX "Richiesta_stato_idx" ON "Richiesta"("stato");

-- CreateIndex
CREATE INDEX "Richiesta_creataIl_idx" ON "Richiesta"("creataIl");

-- CreateIndex
CREATE INDEX "Richiesta_eliminareDopo_idx" ON "Richiesta"("eliminareDopo");

-- CreateIndex
CREATE INDEX "Contenuto_tipo_idx" ON "Contenuto"("tipo");

-- CreateIndex
CREATE INDEX "RevisioneContenuto_contenutoId_creataIl_idx" ON "RevisioneContenuto"("contenutoId", "creataIl");

-- CreateIndex
CREATE INDEX "Pubblicazione_iniziataIl_idx" ON "Pubblicazione"("iniziataIl");

-- CreateIndex
CREATE INDEX "Evento_creatoIl_idx" ON "Evento"("creatoIl");

-- CreateIndex
CREATE INDEX "Evento_utenteId_idx" ON "Evento"("utenteId");

-- AddForeignKey
ALTER TABLE "Sessione" ADD CONSTRAINT "Sessione_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisioneContenuto" ADD CONSTRAINT "RevisioneContenuto_contenutoId_fkey" FOREIGN KEY ("contenutoId") REFERENCES "Contenuto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

