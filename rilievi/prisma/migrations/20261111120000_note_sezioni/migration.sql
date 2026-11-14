-- Бележка на всеки раздел на картата (собственикът, 11 ноември 2026): ubicazione, tipologia, funi, limitatore,
-- allarme. „Note impianto“ остава в колоната си (`noteImpianto`) — само мести раздела. Само добавя.
ALTER TABLE "Scheda" ADD COLUMN     "allarmeNote" TEXT,
ADD COLUMN     "funiNote" TEXT,
ADD COLUMN     "limitatoreNote" TEXT,
ADD COLUMN     "tipologiaNote" TEXT,
ADD COLUMN     "ubicazioneNote" TEXT;
