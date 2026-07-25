-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MASTER', 'ADMIN', 'DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE', 'CLIENTE');

-- CreateEnum
CREATE TYPE "StatoImpianto" AS ENUM ('ATTIVO', 'FERMO', 'MANUTENZIONE', 'FUORI_SERVIZIO', 'DISMESSO');

-- CreateEnum
CREATE TYPE "StatoOrdine" AS ENUM ('BOZZA', 'EMESSO', 'CONFERMATO', 'IN_LAVORO', 'SOSPESO', 'COMPLETATO', 'CHIUSO', 'CONTESTATO', 'ANNULLATO');

-- CreateEnum
CREATE TYPE "PrioritaOrdine" AS ENUM ('ORDINARIA', 'URGENTE', 'EMERGENZA');

-- CreateEnum
CREATE TYPE "StatoPreventivo" AS ENUM ('BOZZA', 'INVIATO', 'APPROVATO', 'RIFIUTATO', 'SCADUTO');

-- CreateEnum
CREATE TYPE "TipoFattura" AS ENUM ('EMESSA', 'RICEVUTA');

-- CreateEnum
CREATE TYPE "StatoFattura" AS ENUM ('BOZZA', 'EMESSA', 'INVIATA', 'PAGATA', 'SCADUTA', 'STORNATA');

-- CreateEnum
CREATE TYPE "TipoAmministratore" AS ENUM ('PERSONA_FISICA', 'SOCIETA');

-- CreateEnum
CREATE TYPE "TipoDipendente" AS ENUM ('TECNICO', 'AMMINISTRATIVO', 'COMMERCIALE', 'MAGAZZINIERE');

-- CreateEnum
CREATE TYPE "TipoCottimista" AS ENUM ('DITTA_INDIVIDUALE', 'COOPERATIVA', 'AZIENDA');

-- CreateEnum
CREATE TYPE "TipoMagazzino" AS ENUM ('COMPONENTI', 'VENDITA');

-- CreateEnum
CREATE TYPE "TipoMovimento" AS ENUM ('ENTRATA', 'USCITA', 'RETTIFICA');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CARTELLO_CANTIERE', 'VERBALE_CANTIERE', 'CERTIFICATO', 'CONTRATTO', 'ALTRO');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "piano" TEXT NOT NULL DEFAULT 'TRIAL',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "scadenzaAbbonamento" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "ruolo" "UserRole" NOT NULL DEFAULT 'OPERATORE',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "tentativi" INTEGER NOT NULL DEFAULT 0,
    "bloccatoFino" TIMESTAMP(3),
    "ultimoAccesso" TIMESTAMP(3),
    "refreshToken" TEXT,
    "tenantId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "azione" TEXT NOT NULL,
    "entita" TEXT NOT NULL,
    "entitaId" TEXT,
    "dettagli" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "hmac" TEXT NOT NULL,
    "utenteId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impianti" (
    "id" UUID NOT NULL,
    "matricola" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modello" TEXT NOT NULL,
    "anno" INTEGER,
    "portata" INTEGER,
    "fermate" INTEGER,
    "stato" "StatoImpianto" NOT NULL DEFAULT 'ATTIVO',
    "indirizzo" TEXT,
    "piano" TEXT,
    "dataInstallazione" TIMESTAMP(3),
    "ultimaRevisione" TIMESTAMP(3),
    "prossimaRevisione" TIMESTAMP(3),
    "condominioId" UUID,
    "amministratoreId" UUID,
    "note" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "impianti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impianti_media" (
    "id" UUID NOT NULL,
    "impiantoId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "nome" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "impianti_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scadenze_impianti" (
    "id" UUID NOT NULL,
    "impiantoId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataScadenza" TIMESTAMP(3) NOT NULL,
    "notificato90" BOOLEAN NOT NULL DEFAULT false,
    "notificato60" BOOLEAN NOT NULL DEFAULT false,
    "notificato30" BOOLEAN NOT NULL DEFAULT false,
    "completata" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scadenze_impianti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assegnazioni_tecnici" (
    "id" UUID NOT NULL,
    "impiantoId" UUID NOT NULL,
    "dipendenteId" UUID NOT NULL,
    "dataInizio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFine" TIMESTAMP(3),
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assegnazioni_tecnici_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condomini" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "indirizzo" TEXT NOT NULL,
    "citta" TEXT NOT NULL,
    "cap" TEXT,
    "provincia" TEXT,
    "codiceFiscale" TEXT,
    "unitaImmobiliari" INTEGER,
    "amministratoreId" UUID,
    "note" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condomini_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amministratori" (
    "id" UUID NOT NULL,
    "tipo" "TipoAmministratore" NOT NULL DEFAULT 'PERSONA_FISICA',
    "nome" TEXT NOT NULL,
    "cognome" TEXT,
    "ragioneSociale" TEXT,
    "partitaIva" TEXT,
    "codiceFiscale" TEXT,
    "pec" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "indirizzo" TEXT,
    "citta" TEXT,
    "cap" TEXT,
    "note" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amministratori_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dipendenti" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "tipo" "TipoDipendente" NOT NULL DEFAULT 'TECNICO',
    "codiceFiscale" TEXT,
    "dataAssunzione" TIMESTAMP(3),
    "patente" TEXT,
    "specializzazioni" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email" TEXT,
    "telefono" TEXT,
    "note" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dipendenti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automezzi" (
    "id" UUID NOT NULL,
    "targa" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modello" TEXT NOT NULL,
    "chilometraggio" INTEGER NOT NULL DEFAULT 0,
    "scadenzaRevisione" TIMESTAMP(3),
    "scadenzaAssicurazione" TIMESTAMP(3),
    "scadenzaTagliando" TIMESTAMP(3),
    "stato" TEXT NOT NULL DEFAULT 'verde',
    "conducenteId" UUID,
    "note" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automezzi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cottimisti" (
    "id" UUID NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "tipo" "TipoCottimista" NOT NULL DEFAULT 'DITTA_INDIVIDUALE',
    "partitaIva" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "indirizzo" TEXT,
    "note" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cottimisti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squadre" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cottimistiId" UUID NOT NULL,
    "capocantiere" TEXT,
    "membri" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "squadre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articoli_magazzino" (
    "id" UUID NOT NULL,
    "codice" TEXT NOT NULL,
    "barcode" TEXT,
    "nome" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL DEFAULT '',
    "tipo" "TipoMagazzino" NOT NULL DEFAULT 'COMPONENTI',
    "categoria" TEXT,
    "ubicazione" TEXT,
    "quantita" INTEGER NOT NULL DEFAULT 0,
    "sogliaMinima" INTEGER NOT NULL DEFAULT 0,
    "prezzoAcquisto" DECIMAL(12,2),
    "prezzoVendita" DECIMAL(12,2),
    "marginePerc" DECIMAL(7,2),
    "aliquotaIva" DECIMAL(5,2) NOT NULL DEFAULT 22,
    "note" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articoli_magazzino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimenti_magazzino" (
    "id" UUID NOT NULL,
    "articoloId" UUID NOT NULL,
    "tipo" "TipoMovimento" NOT NULL,
    "quantita" INTEGER NOT NULL,
    "nota" TEXT,
    "ddtId" UUID,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movimenti_magazzino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preventivi" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "stato" "StatoPreventivo" NOT NULL DEFAULT 'BOZZA',
    "oggetto" TEXT NOT NULL,
    "descrizione" TEXT,
    "totaleNetto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totaleIva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totaleLordo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "validitaGiorni" INTEGER NOT NULL DEFAULT 30,
    "impiantoId" UUID,
    "amministratoreId" UUID,
    "utenteId" UUID,
    "note" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preventivi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voci_preventivo" (
    "id" UUID NOT NULL,
    "preventivoId" UUID NOT NULL,
    "articoloId" UUID,
    "descrizione" TEXT NOT NULL,
    "quantita" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "prezzoUnitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "aliquotaIva" DECIMAL(5,2) NOT NULL DEFAULT 22,
    "totale" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voci_preventivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordini_lavoro" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "stato" "StatoOrdine" NOT NULL DEFAULT 'BOZZA',
    "priorita" "PrioritaOrdine" NOT NULL DEFAULT 'ORDINARIA',
    "oggetto" TEXT NOT NULL,
    "descrizione" TEXT,
    "noteInterne" TEXT,
    "noteCommittente" TEXT,
    "dataInizio" TIMESTAMP(3),
    "dataFine" TIMESTAMP(3),
    "impiantoId" UUID,
    "preventivoId" UUID,
    "tecnicoId" UUID,
    "cottimistiId" UUID,
    "squadraId" UUID,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordini_lavoro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storico_stati" (
    "id" UUID NOT NULL,
    "ordineLavoroId" UUID NOT NULL,
    "statoPrecedente" "StatoOrdine",
    "statoNuovo" "StatoOrdine" NOT NULL,
    "nota" TEXT,
    "utente" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storico_stati_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fatture" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "TipoFattura" NOT NULL DEFAULT 'EMESSA',
    "stato" "StatoFattura" NOT NULL DEFAULT 'BOZZA',
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataScadenza" TIMESTAMP(3),
    "oggetto" TEXT,
    "totaleNetto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totaleIva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totaleLordo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amministratoreId" UUID,
    "ordineLavoroId" UUID,
    "utenteId" UUID,
    "note" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fatture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voci_fattura" (
    "id" UUID NOT NULL,
    "fatturaId" UUID NOT NULL,
    "descrizione" TEXT NOT NULL,
    "quantita" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "prezzoUnitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "aliquotaIva" DECIMAL(5,2) NOT NULL DEFAULT 22,
    "totale" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voci_fattura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ddt" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "causale" TEXT,
    "destinatario" TEXT,
    "indirizzoConsegna" TEXT,
    "vettore" TEXT,
    "ordineLavoroId" UUID,
    "note" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ddt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "righe_ddt" (
    "id" UUID NOT NULL,
    "ddtId" UUID NOT NULL,
    "descrizione" TEXT NOT NULL,
    "quantita" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "um" TEXT,
    "peso" DECIMAL(10,2),
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "righe_ddt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documenti" (
    "id" UUID NOT NULL,
    "tipo" "TipoDocumento" NOT NULL DEFAULT 'ALTRO',
    "titolo" TEXT NOT NULL,
    "contenuto" TEXT,
    "fileUrl" TEXT,
    "utenteId" UUID,
    "note" TEXT,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documenti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automatismi_run" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "iniziatoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminatoAt" TIMESTAMP(3),
    "esito" TEXT NOT NULL DEFAULT 'IN_CORSO',
    "durataMs" INTEGER,
    "dettagli" JSONB,
    "errore" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automatismi_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_log_entita_entitaId_idx" ON "audit_log"("entita", "entitaId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "impianti_matricola_key" ON "impianti"("matricola");

-- CreateIndex
CREATE INDEX "impianti_tenantId_idx" ON "impianti"("tenantId");

-- CreateIndex
CREATE INDEX "impianti_media_tenantId_idx" ON "impianti_media"("tenantId");

-- CreateIndex
CREATE INDEX "scadenze_impianti_dataScadenza_idx" ON "scadenze_impianti"("dataScadenza");

-- CreateIndex
CREATE INDEX "scadenze_impianti_tenantId_idx" ON "scadenze_impianti"("tenantId");

-- CreateIndex
CREATE INDEX "assegnazioni_tecnici_tenantId_idx" ON "assegnazioni_tecnici"("tenantId");

-- CreateIndex
CREATE INDEX "condomini_tenantId_idx" ON "condomini"("tenantId");

-- CreateIndex
CREATE INDEX "amministratori_tenantId_idx" ON "amministratori"("tenantId");

-- CreateIndex
CREATE INDEX "dipendenti_tenantId_idx" ON "dipendenti"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "automezzi_targa_key" ON "automezzi"("targa");

-- CreateIndex
CREATE UNIQUE INDEX "automezzi_conducenteId_key" ON "automezzi"("conducenteId");

-- CreateIndex
CREATE INDEX "automezzi_tenantId_idx" ON "automezzi"("tenantId");

-- CreateIndex
CREATE INDEX "cottimisti_tenantId_idx" ON "cottimisti"("tenantId");

-- CreateIndex
CREATE INDEX "squadre_tenantId_idx" ON "squadre"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "articoli_magazzino_codice_key" ON "articoli_magazzino"("codice");

-- CreateIndex
CREATE INDEX "articoli_magazzino_tenantId_idx" ON "articoli_magazzino"("tenantId");

-- CreateIndex
CREATE INDEX "movimenti_magazzino_tenantId_idx" ON "movimenti_magazzino"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "preventivi_numero_key" ON "preventivi"("numero");

-- CreateIndex
CREATE INDEX "preventivi_tenantId_idx" ON "preventivi"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ordini_lavoro_numero_key" ON "ordini_lavoro"("numero");

-- CreateIndex
CREATE INDEX "ordini_lavoro_tenantId_idx" ON "ordini_lavoro"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "fatture_numero_key" ON "fatture"("numero");

-- CreateIndex
CREATE INDEX "fatture_tenantId_idx" ON "fatture"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ddt_numero_key" ON "ddt"("numero");

-- CreateIndex
CREATE INDEX "ddt_tenantId_idx" ON "ddt"("tenantId");

-- CreateIndex
CREATE INDEX "documenti_tenantId_idx" ON "documenti"("tenantId");

-- CreateIndex
CREATE INDEX "automatismi_run_nome_iniziatoAt_idx" ON "automatismi_run"("nome", "iniziatoAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impianti" ADD CONSTRAINT "impianti_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "condomini"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impianti" ADD CONSTRAINT "impianti_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impianti_media" ADD CONSTRAINT "impianti_media_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scadenze_impianti" ADD CONSTRAINT "scadenze_impianti_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assegnazioni_tecnici" ADD CONSTRAINT "assegnazioni_tecnici_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assegnazioni_tecnici" ADD CONSTRAINT "assegnazioni_tecnici_dipendenteId_fkey" FOREIGN KEY ("dipendenteId") REFERENCES "dipendenti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condomini" ADD CONSTRAINT "condomini_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automezzi" ADD CONSTRAINT "automezzi_conducenteId_fkey" FOREIGN KEY ("conducenteId") REFERENCES "dipendenti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squadre" ADD CONSTRAINT "squadre_cottimistiId_fkey" FOREIGN KEY ("cottimistiId") REFERENCES "cottimisti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimenti_magazzino" ADD CONSTRAINT "movimenti_magazzino_articoloId_fkey" FOREIGN KEY ("articoloId") REFERENCES "articoli_magazzino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimenti_magazzino" ADD CONSTRAINT "movimenti_magazzino_ddtId_fkey" FOREIGN KEY ("ddtId") REFERENCES "ddt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preventivi" ADD CONSTRAINT "preventivi_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preventivi" ADD CONSTRAINT "preventivi_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preventivi" ADD CONSTRAINT "preventivi_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voci_preventivo" ADD CONSTRAINT "voci_preventivo_preventivoId_fkey" FOREIGN KEY ("preventivoId") REFERENCES "preventivi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voci_preventivo" ADD CONSTRAINT "voci_preventivo_articoloId_fkey" FOREIGN KEY ("articoloId") REFERENCES "articoli_magazzino"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordini_lavoro" ADD CONSTRAINT "ordini_lavoro_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordini_lavoro" ADD CONSTRAINT "ordini_lavoro_preventivoId_fkey" FOREIGN KEY ("preventivoId") REFERENCES "preventivi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordini_lavoro" ADD CONSTRAINT "ordini_lavoro_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "dipendenti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordini_lavoro" ADD CONSTRAINT "ordini_lavoro_cottimistiId_fkey" FOREIGN KEY ("cottimistiId") REFERENCES "cottimisti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordini_lavoro" ADD CONSTRAINT "ordini_lavoro_squadraId_fkey" FOREIGN KEY ("squadraId") REFERENCES "squadre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storico_stati" ADD CONSTRAINT "storico_stati_ordineLavoroId_fkey" FOREIGN KEY ("ordineLavoroId") REFERENCES "ordini_lavoro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fatture" ADD CONSTRAINT "fatture_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fatture" ADD CONSTRAINT "fatture_ordineLavoroId_fkey" FOREIGN KEY ("ordineLavoroId") REFERENCES "ordini_lavoro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fatture" ADD CONSTRAINT "fatture_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voci_fattura" ADD CONSTRAINT "voci_fattura_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "fatture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ddt" ADD CONSTRAINT "ddt_ordineLavoroId_fkey" FOREIGN KEY ("ordineLavoroId") REFERENCES "ordini_lavoro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "righe_ddt" ADD CONSTRAINT "righe_ddt_ddtId_fkey" FOREIGN KEY ("ddtId") REFERENCES "ddt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documenti" ADD CONSTRAINT "documenti_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

