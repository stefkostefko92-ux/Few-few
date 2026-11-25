-- „Verbale di chiusura cantiere“ (собственикът, 5 ноември 2026): протоколът за приключване на обекта —
-- от картата на уредбата или без карта, редовете по раздели, „Verbale positivo“, двата подписа (техникът
-- изпълнител и супервайзърът) само с потвърждението, отпечатък и печат като на листа за интервенция.
-- Само нова таблица — нищо съществуващо не се пипа.

-- CreateTable
CREATE TABLE "Verbale" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "schedaId" TEXT,
    "data" DATE NOT NULL,
    "indirizzo" VARCHAR(200),
    "buono" VARCHAR(60),
    "voci" JSONB NOT NULL DEFAULT '{}',
    "positivo" BOOLEAN,
    "firmaTecnico" JSONB,
    "firmaTecnicoNome" VARCHAR(120),
    "firmaSupervisore" JSONB,
    "firmaSupervisoreNome" VARCHAR(120),
    "confermatoAt" TIMESTAMP(3),
    "impronta" CHAR(64),
    "sigillo" CHAR(64),
    "firmaTecnicoHash" CHAR(64),
    "firmaSupervisoreHash" CHAR(64),
    "confermatoById" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verbale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Verbale_aziendaId_createdAt_idx" ON "Verbale"("aziendaId", "createdAt");

-- CreateIndex
CREATE INDEX "Verbale_schedaId_createdAt_idx" ON "Verbale"("schedaId", "createdAt");

-- CreateIndex
CREATE INDEX "Verbale_createdById_idx" ON "Verbale"("createdById");

-- CreateIndex
CREATE INDEX "Verbale_updatedById_idx" ON "Verbale"("updatedById");

-- CreateIndex
CREATE INDEX "Verbale_confermatoById_idx" ON "Verbale"("confermatoById");

-- CreateIndex
CREATE INDEX "Verbale_firmaTecnicoHash_idx" ON "Verbale"("firmaTecnicoHash");

-- CreateIndex
CREATE INDEX "Verbale_firmaSupervisoreHash_idx" ON "Verbale"("firmaSupervisoreHash");

-- AddForeignKey
ALTER TABLE "Verbale" ADD CONSTRAINT "Verbale_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verbale" ADD CONSTRAINT "Verbale_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verbale" ADD CONSTRAINT "Verbale_confermatoById_fkey" FOREIGN KEY ("confermatoById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verbale" ADD CONSTRAINT "Verbale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verbale" ADD CONSTRAINT "Verbale_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Чернова: нито подпис, нито име, нито отпечатъци и печат. Потвърден: двата подписа с имената и
-- отпечатъците им, отпечатъкът и печатът на съдържанието и „Verbale positivo“ (SÌ или NO).
ALTER TABLE "Verbale" ADD CONSTRAINT "Verbale_firme_check" CHECK (
  ("confermatoAt" IS NULL
    AND "firmaTecnico" IS NULL AND "firmaTecnicoNome" IS NULL
    AND "firmaSupervisore" IS NULL AND "firmaSupervisoreNome" IS NULL
    AND "impronta" IS NULL AND "sigillo" IS NULL
    AND "firmaTecnicoHash" IS NULL AND "firmaSupervisoreHash" IS NULL)
  OR ("confermatoAt" IS NOT NULL
    AND "firmaTecnico" IS NOT NULL AND "firmaTecnicoNome" IS NOT NULL
    AND "firmaSupervisore" IS NOT NULL AND "firmaSupervisoreNome" IS NOT NULL
    AND "impronta" IS NOT NULL AND "sigillo" IS NOT NULL
    AND "firmaTecnicoHash" IS NOT NULL AND "firmaSupervisoreHash" IS NOT NULL
    AND "positivo" IS NOT NULL)
);
