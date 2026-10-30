-- Октомври 2026 (30-ти, прегледът на подписа): щрихите на подпис, който вече стои на друг лист
-- (копирани от страницата, PDF-а или прихванати), не се приемат при потвърждението. За това всеки подпис
-- има отпечатък (SHA-256 на щрихите), с индекс. Само добавя: предишният код не чете колоните.

-- AlterTable
ALTER TABLE "Intervento" ADD COLUMN     "firmaClienteHash" CHAR(64),
ADD COLUMN     "firmaTecnicoHash" CHAR(64);

-- Потвърдените листове досега: отпечатъкът е същият низ като в приложението (sigillo.ts, improntaFirma) —
-- щрихите като JSON без интервали. Подписите в базата са само цели числа, затова махането на интервалите
-- не пипа нищо друго. Печатът не включва тези колони — не се сменя.
UPDATE "Intervento"
SET "firmaTecnicoHash" = encode(sha256(convert_to(replace(("firmaTecnico" -> 's')::text, ' ', ''), 'UTF8')), 'hex'),
    "firmaClienteHash" = encode(sha256(convert_to(replace(("firmaCliente" -> 's')::text, ' ', ''), 'UTF8')), 'hex')
WHERE "confermatoAt" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Intervento_firmaTecnicoHash_idx" ON "Intervento"("firmaTecnicoHash");

-- CreateIndex
CREATE INDEX "Intervento_firmaClienteHash_idx" ON "Intervento"("firmaClienteHash");

-- Чернова: нито подпис, нито име, нито отпечатъци и печат. Потвърден: двата подписа с имената и
-- отпечатъците им.
ALTER TABLE "Intervento" DROP CONSTRAINT "Intervento_firme_check";
ALTER TABLE "Intervento" ADD CONSTRAINT "Intervento_firme_check" CHECK (
  ("confermatoAt" IS NULL
    AND "firmaTecnico" IS NULL AND "firmaTecnicoNome" IS NULL
    AND "firmaCliente" IS NULL AND "firmaClienteNome" IS NULL
    AND "impronta" IS NULL AND "sigillo" IS NULL
    AND "firmaTecnicoHash" IS NULL AND "firmaClienteHash" IS NULL)
  OR ("confermatoAt" IS NOT NULL
    AND "firmaTecnico" IS NOT NULL AND "firmaTecnicoNome" IS NOT NULL
    AND "firmaCliente" IS NOT NULL AND "firmaClienteNome" IS NOT NULL
    AND "firmaTecnicoHash" IS NOT NULL AND "firmaClienteHash" IS NOT NULL)
);
