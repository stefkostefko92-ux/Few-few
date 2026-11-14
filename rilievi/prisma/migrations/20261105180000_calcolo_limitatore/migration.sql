-- Изчислението за ограничителя на скоростта (собственикът, 5 ноември 2026 — по своя
-- „Limitatore_velocita_EN81-20-2020.xlsx“): по едно на карта или без карта, като изчислението за аргано.
-- Окончателно изтритата карта го взима със себе си. Само добавя.

-- CreateTable
CREATE TABLE "CalcoloLimitatore" (
    "id" TEXT NOT NULL,
    "schedaId" TEXT,
    "aziendaId" TEXT NOT NULL,
    "indirizzo" TEXT,
    "matricola" TEXT,
    "numeroImpianto" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "dati" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalcoloLimitatore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalcoloLimitatore_schedaId_key" ON "CalcoloLimitatore"("schedaId");

-- CreateIndex
CREATE INDEX "CalcoloLimitatore_updatedById_idx" ON "CalcoloLimitatore"("updatedById");

-- CreateIndex
CREATE INDEX "CalcoloLimitatore_aziendaId_updatedAt_idx" ON "CalcoloLimitatore"("aziendaId", "updatedAt");

-- AddForeignKey
ALTER TABLE "CalcoloLimitatore" ADD CONSTRAINT "CalcoloLimitatore_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalcoloLimitatore" ADD CONSTRAINT "CalcoloLimitatore_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalcoloLimitatore" ADD CONSTRAINT "CalcoloLimitatore_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Без карта — поне адресът (иначе изчислението не се намира и PDF-ът няма уредба).
ALTER TABLE "CalcoloLimitatore" ADD CONSTRAINT "CalcoloLimitatore_impianto_check"
  CHECK ("schedaId" IS NOT NULL OR length(btrim(coalesce("indirizzo", ''))) > 0);
