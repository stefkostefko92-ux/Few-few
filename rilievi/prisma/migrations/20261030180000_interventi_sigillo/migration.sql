-- Октомври 2026 (30-ти, собственикът): подписът на листа за интервенция е обвързан със съдържанието.
-- Подписите и имената се слагат само с потвърждението, върху окончателния лист; с тях се пишат
-- отпечатъкът на съдържанието (SHA-256) и печатът (HMAC с INTERVENTI_SEAL_KEY). Черновата никога не носи
-- подписи — пази го и базата (CHECK по-долу), не само кодът.

-- AlterTable
ALTER TABLE "Intervento" ADD COLUMN     "impronta" CHAR(64),
ADD COLUMN     "sigillo" CHAR(64);

-- Черновите от предишната версия: подписите и имената им са положени върху чернова, не върху
-- окончателното съдържание — махат се (подписва се наново при потвърждението). Потвърдените не се пипат.
UPDATE "Intervento"
SET "firmaTecnico" = NULL, "firmaTecnicoNome" = NULL, "firmaCliente" = NULL, "firmaClienteNome" = NULL
WHERE "confermatoAt" IS NULL
  AND ("firmaTecnico" IS NOT NULL OR "firmaTecnicoNome" IS NOT NULL
    OR "firmaCliente" IS NOT NULL OR "firmaClienteNome" IS NOT NULL);

-- Чернова: нито подпис, нито име, нито отпечатък и печат. Потвърден: двата подписа с имената.
-- (Потвърден лист отпреди печата няма отпечатък и печат — приложението не го пуска навън.)
ALTER TABLE "Intervento" ADD CONSTRAINT "Intervento_firme_check" CHECK (
  ("confermatoAt" IS NULL
    AND "firmaTecnico" IS NULL AND "firmaTecnicoNome" IS NULL
    AND "firmaCliente" IS NULL AND "firmaClienteNome" IS NULL
    AND "impronta" IS NULL AND "sigillo" IS NULL)
  OR ("confermatoAt" IS NOT NULL
    AND "firmaTecnico" IS NOT NULL AND "firmaTecnicoNome" IS NOT NULL
    AND "firmaCliente" IS NOT NULL AND "firmaClienteNome" IS NOT NULL)
);
