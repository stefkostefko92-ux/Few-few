-- Campi usati dall'interfaccia ma mancanti nello schema iniziale

-- Impianti: quadro di manovra, foto e documenti allegati
ALTER TABLE "impianti" ADD COLUMN "quadro" TEXT;
ALTER TABLE "impianti" ADD COLUMN "foto" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "impianti" ADD COLUMN "documenti" JSONB NOT NULL DEFAULT '[]';

-- Fatture: dati pagamento e anagrafiche libere
ALTER TABLE "fatture" ALTER COLUMN "tipo" SET DEFAULT 'EMESSA';
ALTER TABLE "fatture" ADD COLUMN "dataPagamento" TIMESTAMP(3);
ALTER TABLE "fatture" ADD COLUMN "metodoPagamento" TEXT;
ALTER TABLE "fatture" ADD COLUMN "cliente" TEXT;
ALTER TABLE "fatture" ADD COLUMN "fornitore" TEXT;
ALTER TABLE "fatture" ADD COLUMN "numeroFornitore" TEXT;

-- Documenti: indirizzo/città per cartelli di cantiere
ALTER TABLE "documenti" ADD COLUMN "indirizzo" TEXT;
ALTER TABLE "documenti" ADD COLUMN "citta" TEXT;
