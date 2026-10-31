-- Изчислението за аргано по „RT-E MOD 10411-1“: входът на картата (JSON), по едно на карта; окончателно
-- изтритата карта го взима със себе си. Само добавя.

-- CreateTable
CREATE TABLE "CalcoloArgano" (
    "id" TEXT NOT NULL,
    "schedaId" TEXT NOT NULL,
    "dati" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalcoloArgano_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalcoloArgano_schedaId_key" ON "CalcoloArgano"("schedaId");

-- CreateIndex
CREATE INDEX "CalcoloArgano_updatedById_idx" ON "CalcoloArgano"("updatedById");

-- AddForeignKey
ALTER TABLE "CalcoloArgano" ADD CONSTRAINT "CalcoloArgano_schedaId_fkey" FOREIGN KEY ("schedaId") REFERENCES "Scheda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalcoloArgano" ADD CONSTRAINT "CalcoloArgano_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

