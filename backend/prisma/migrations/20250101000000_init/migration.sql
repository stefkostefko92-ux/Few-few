-- ERP Ascensori Enterprise — Initial Migration
-- PostgreSQL 16

-- ═══════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════

CREATE TYPE "UserRole" AS ENUM ('MASTER', 'ADMIN', 'DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE', 'CLIENTE');
CREATE TYPE "StatoImpianto" AS ENUM ('ATTIVO', 'FERMO', 'MANUTENZIONE', 'FUORI_SERVIZIO', 'DISMESSO');
CREATE TYPE "TipoAmministratore" AS ENUM ('PERSONA_FISICA', 'SOCIETA');
CREATE TYPE "TipoDipendente" AS ENUM ('TECNICO', 'AMMINISTRATIVO', 'COMMERCIALE', 'MAGAZZINIERE');
CREATE TYPE "TipoCottimista" AS ENUM ('DITTA_INDIVIDUALE', 'COOPERATIVA', 'AZIENDA');
CREATE TYPE "TipoMagazzino" AS ENUM ('COMPONENTI', 'VENDITA');
CREATE TYPE "TipoMovimento" AS ENUM ('ENTRATA', 'USCITA', 'RETTIFICA');
CREATE TYPE "StatoPreventivo" AS ENUM ('BOZZA', 'INVIATO', 'APPROVATO', 'RIFIUTATO', 'SCADUTO');
CREATE TYPE "StatoOrdine" AS ENUM ('BOZZA', 'EMESSO', 'CONFERMATO', 'IN_LAVORO', 'SOSPESO', 'COMPLETATO', 'CHIUSO', 'CONTESTATO', 'ANNULLATO');
CREATE TYPE "PrioritaOrdine" AS ENUM ('ORDINARIA', 'URGENTE', 'EMERGENZA');
CREATE TYPE "TipoFattura" AS ENUM ('EMESSA', 'RICEVUTA');
CREATE TYPE "StatoFattura" AS ENUM ('BOZZA', 'EMESSA', 'INVIATA', 'PAGATA', 'SCADUTA', 'STORNATA');
CREATE TYPE "TipoDocumento" AS ENUM ('CARTELLO_CANTIERE', 'VERBALE_CANTIERE', 'CERTIFICATO', 'CONTRATTO', 'ALTRO');

-- ═══════════════════════════════════════════════════════
-- TABLES

CREATE TABLE "tenants" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "piano" TEXT NOT NULL DEFAULT 'TRIAL',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "scadenzaAbbonamento" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
-- ═══════════════════════════════════════════════════════

CREATE TABLE "users" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
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
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "amministratori" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "TipoAmministratore" NOT NULL DEFAULT 'PERSONA_FISICA',
    "nome" TEXT NOT NULL,
    "cognome" TEXT,
    "ragioneSociale" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "pec" TEXT,
    "codiceFiscale" TEXT,
    "partitaIva" TEXT,
    "indirizzo" TEXT,
    "citta" TEXT,
    "cap" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "amministratori_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "condomini" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "indirizzo" TEXT NOT NULL,
    "citta" TEXT NOT NULL,
    "cap" TEXT,
    "provincia" TEXT,
    "codiceFiscale" TEXT,
    "unitaImmobiliari" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "amministratoreId" TEXT,
    CONSTRAINT "condomini_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "condomini_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL
);

CREATE TABLE "impianti" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "matricola" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modello" TEXT NOT NULL,
    "anno" INTEGER,
    "portata" INTEGER,
    "fermate" INTEGER,
    "stato" "StatoImpianto" NOT NULL DEFAULT 'ATTIVO',
    "indirizzo" TEXT,
    "piano" TEXT,
    "note" TEXT,
    "dataInstallazione" TIMESTAMP(3),
    "prossimaRevisione" TIMESTAMP(3),
    "ultimaRevisione" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "condominioId" TEXT,
    "amministratoreId" TEXT,
    CONSTRAINT "impianti_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "impianti_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "condomini"("id") ON DELETE SET NULL,
    CONSTRAINT "impianti_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "impianti_matricola_key" ON "impianti"("matricola");

CREATE TABLE "impianti_media" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "impiantoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "nome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "impianti_media_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "impianti_media_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE CASCADE
);

CREATE TABLE "scadenze_impianti" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "impiantoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataScadenza" TIMESTAMP(3) NOT NULL,
    "notificato90" BOOLEAN NOT NULL DEFAULT false,
    "notificato60" BOOLEAN NOT NULL DEFAULT false,
    "notificato30" BOOLEAN NOT NULL DEFAULT false,
    "completata" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scadenze_impianti_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scadenze_impianti_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE CASCADE
);

CREATE TABLE "dipendenti" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "tipo" "TipoDipendente" NOT NULL DEFAULT 'TECNICO',
    "email" TEXT,
    "telefono" TEXT,
    "codiceFiscale" TEXT,
    "dataAssunzione" TIMESTAMP(3),
    "patente" TEXT,
    "specializzazioni" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dipendenti_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assegnazioni_tecnici" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "impiantoId" TEXT NOT NULL,
    "dipendenteId" TEXT NOT NULL,
    "dataInizio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFine" TIMESTAMP(3),
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "assegnazioni_tecnici_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assegnazioni_tecnici_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id"),
    CONSTRAINT "assegnazioni_tecnici_dipendenteId_fkey" FOREIGN KEY ("dipendenteId") REFERENCES "dipendenti"("id")
);

CREATE TABLE "automezzi" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "targa" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modello" TEXT NOT NULL,
    "anno" INTEGER,
    "chilometraggio" INTEGER DEFAULT 0,
    "scadenzaRevisione" TIMESTAMP(3),
    "scadenzaAssicurazione" TIMESTAMP(3),
    "scadenzaTagliando" TIMESTAMP(3),
    "stato" TEXT NOT NULL DEFAULT 'verde',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "conducenteId" TEXT,
    CONSTRAINT "automezzi_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "automezzi_conducenteId_fkey" FOREIGN KEY ("conducenteId") REFERENCES "dipendenti"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "automezzi_targa_key" ON "automezzi"("targa");
CREATE UNIQUE INDEX "automezzi_conducenteId_key" ON "automezzi"("conducenteId");

CREATE TABLE "cottimisti" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "ragioneSociale" TEXT NOT NULL,
    "tipo" "TipoCottimista" NOT NULL DEFAULT 'AZIENDA',
    "partitaIva" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "indirizzo" TEXT,
    "note" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cottimisti_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "squadre" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "cottimistiId" TEXT NOT NULL,
    "capocantiere" TEXT,
    "membri" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "squadre_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "squadre_cottimistiId_fkey" FOREIGN KEY ("cottimistiId") REFERENCES "cottimisti"("id")
);

CREATE TABLE "articoli_magazzino" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "codice" TEXT NOT NULL,
    "barcode" TEXT,
    "nome" TEXT NOT NULL,
    "descrizione" TEXT,
    "tipo" "TipoMagazzino" NOT NULL,
    "categoria" TEXT,
    "ubicazione" TEXT,
    "quantita" INTEGER NOT NULL DEFAULT 0,
    "sogliaMinima" INTEGER NOT NULL DEFAULT 0,
    "prezzoAcquisto" DECIMAL(10,2),
    "prezzoVendita" DECIMAL(10,2),
    "marginePerc" DECIMAL(5,2),
    "aliquotaIva" DECIMAL(5,2) NOT NULL DEFAULT 22,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "articoli_magazzino_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "articoli_magazzino_codice_key" ON "articoli_magazzino"("codice");

CREATE TABLE "preventivi" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stato" "StatoPreventivo" NOT NULL DEFAULT 'BOZZA',
    "oggetto" TEXT NOT NULL,
    "descrizione" TEXT,
    "note" TEXT,
    "totaleNetto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totaleIva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totaleLordo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "validitaGiorni" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "impiantoId" TEXT,
    "amministratoreId" TEXT,
    "utenteId" TEXT,
    CONSTRAINT "preventivi_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "preventivi_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE SET NULL,
    CONSTRAINT "preventivi_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL,
    CONSTRAINT "preventivi_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "preventivi_numero_key" ON "preventivi"("numero");

CREATE TABLE "voci_preventivo" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "preventivoId" TEXT NOT NULL,
    "articoloId" TEXT,
    "descrizione" TEXT NOT NULL,
    "quantita" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "prezzoUnitario" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "aliquotaIva" DECIMAL(5,2) NOT NULL DEFAULT 22,
    "totale" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "voci_preventivo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voci_preventivo_preventivoId_fkey" FOREIGN KEY ("preventivoId") REFERENCES "preventivi"("id") ON DELETE CASCADE,
    CONSTRAINT "voci_preventivo_articoloId_fkey" FOREIGN KEY ("articoloId") REFERENCES "articoli_magazzino"("id") ON DELETE SET NULL
);

CREATE TABLE "ordini_lavoro" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stato" "StatoOrdine" NOT NULL DEFAULT 'BOZZA',
    "priorita" "PrioritaOrdine" NOT NULL DEFAULT 'ORDINARIA',
    "oggetto" TEXT NOT NULL,
    "descrizione" TEXT,
    "noteInterne" TEXT,
    "noteCommittente" TEXT,
    "dataInizio" TIMESTAMP(3),
    "dataFine" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "impiantoId" TEXT,
    "preventivoId" TEXT,
    "tecnicoId" TEXT,
    "cottimistiId" TEXT,
    "squadraId" TEXT,
    "utenteId" TEXT,
    CONSTRAINT "ordini_lavoro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ordini_lavoro_impiantoId_fkey" FOREIGN KEY ("impiantoId") REFERENCES "impianti"("id") ON DELETE SET NULL,
    CONSTRAINT "ordini_lavoro_preventivoId_fkey" FOREIGN KEY ("preventivoId") REFERENCES "preventivi"("id") ON DELETE SET NULL,
    CONSTRAINT "ordini_lavoro_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "dipendenti"("id") ON DELETE SET NULL,
    CONSTRAINT "ordini_lavoro_cottimistiId_fkey" FOREIGN KEY ("cottimistiId") REFERENCES "cottimisti"("id") ON DELETE SET NULL,
    CONSTRAINT "ordini_lavoro_squadraId_fkey" FOREIGN KEY ("squadraId") REFERENCES "squadre"("id") ON DELETE SET NULL,
    CONSTRAINT "ordini_lavoro_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "ordini_lavoro_numero_key" ON "ordini_lavoro"("numero");

CREATE TABLE "storico_stati" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "ordineLavoroId" TEXT NOT NULL,
    "statoPrecedente" "StatoOrdine",
    "statoNuovo" "StatoOrdine" NOT NULL,
    "nota" TEXT,
    "utente" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "storico_stati_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "storico_stati_ordineLavoroId_fkey" FOREIGN KEY ("ordineLavoroId") REFERENCES "ordini_lavoro"("id") ON DELETE CASCADE
);

CREATE TABLE "fatture" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "tipo" "TipoFattura" NOT NULL,
    "stato" "StatoFattura" NOT NULL DEFAULT 'BOZZA',
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataScadenza" TIMESTAMP(3),
    "oggetto" TEXT,
    "totaleNetto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totaleIva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totaleLordo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "amministratoreId" TEXT,
    "ordineLavoroId" TEXT,
    "utenteId" TEXT,
    CONSTRAINT "fatture_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fatture_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL,
    CONSTRAINT "fatture_ordineLavoroId_fkey" FOREIGN KEY ("ordineLavoroId") REFERENCES "ordini_lavoro"("id") ON DELETE SET NULL,
    CONSTRAINT "fatture_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "fatture_numero_key" ON "fatture"("numero");

CREATE TABLE "voci_fattura" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "fatturaId" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "quantita" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "prezzoUnitario" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "aliquotaIva" DECIMAL(5,2) NOT NULL DEFAULT 22,
    "totale" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "voci_fattura_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voci_fattura_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "fatture"("id") ON DELETE CASCADE
);

CREATE TABLE "ddt" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "causale" TEXT,
    "destinatario" TEXT,
    "indirizzoConsegna" TEXT,
    "vettore" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ordineLavoroId" TEXT,
    CONSTRAINT "ddt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ddt_ordineLavoroId_fkey" FOREIGN KEY ("ordineLavoroId") REFERENCES "ordini_lavoro"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "ddt_numero_key" ON "ddt"("numero");

CREATE TABLE "righe_ddt" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "ddtId" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "quantita" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "um" TEXT,
    "peso" DECIMAL(10,2),
    "ordine" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "righe_ddt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "righe_ddt_ddtId_fkey" FOREIGN KEY ("ddtId") REFERENCES "ddt"("id") ON DELETE CASCADE
);

CREATE TABLE "movimenti_magazzino" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "articoloId" TEXT NOT NULL,
    "tipo" "TipoMovimento" NOT NULL,
    "quantita" INTEGER NOT NULL,
    "nota" TEXT,
    "ddtId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movimenti_magazzino_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movimenti_magazzino_articoloId_fkey" FOREIGN KEY ("articoloId") REFERENCES "articoli_magazzino"("id"),
    CONSTRAINT "movimenti_magazzino_ddtId_fkey" FOREIGN KEY ("ddtId") REFERENCES "ddt"("id") ON DELETE SET NULL
);

CREATE TABLE "documenti" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "TipoDocumento" NOT NULL,
    "titolo" TEXT NOT NULL,
    "contenuto" TEXT,
    "fileUrl" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "utenteId" TEXT,
    CONSTRAINT "documenti_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documenti_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "azione" TEXT NOT NULL,
    "entita" TEXT NOT NULL,
    "entitaId" TEXT,
    "dettagli" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "hmac" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utenteId" TEXT,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_log_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX "audit_log_entita_entitaId_idx" ON "audit_log"("entita", "entitaId");
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");
