-- Ключовете за API само за четене (D2). Само добавя.
CREATE TABLE "ChiaveApi" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "prefisso" VARCHAR(16) NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "scadeAt" TIMESTAMP(3) NOT NULL,
    "usataAt" TIMESTAMP(3),
    "revocataAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChiaveApi_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChiaveApi_prefisso_key" ON "ChiaveApi"("prefisso");
CREATE INDEX "ChiaveApi_aziendaId_idx" ON "ChiaveApi"("aziendaId");
CREATE INDEX "ChiaveApi_createdById_idx" ON "ChiaveApi"("createdById");

ALTER TABLE "ChiaveApi" ADD CONSTRAINT "ChiaveApi_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChiaveApi" ADD CONSTRAINT "ChiaveApi_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Префиксът е 12 знака от [a-z0-9], отпечатъкът — 64 шестнадесетични, името не е празно, изтичането — след създаването.
ALTER TABLE "ChiaveApi" ADD CONSTRAINT "ChiaveApi_check" CHECK (
  "prefisso" ~ '^[a-z0-9]{12}$'
  AND "hash" ~ '^[0-9a-f]{64}$'
  AND length(btrim("nome")) > 0
  AND "scadeAt" > "createdAt"
);
