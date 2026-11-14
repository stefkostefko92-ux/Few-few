-- Входът с доставчика на самоличност на клиента (D1). Само добавя.
CREATE TYPE "FornitoreIdentita" AS ENUM ('MICROSOFT', 'GOOGLE');

ALTER TABLE "Azienda" ADD COLUMN "accessoMicrosoft" VARCHAR(36),
ADD COLUMN "accessoGoogle" VARCHAR(253);

-- Tenant ID — GUID с малки букви; домейнът — име на хост с малки букви.
ALTER TABLE "Azienda" ADD CONSTRAINT "Azienda_accesso_check" CHECK (
  ("accessoMicrosoft" IS NULL OR "accessoMicrosoft" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  AND ("accessoGoogle" IS NULL OR "accessoGoogle" ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$')
);

CREATE TABLE "IdentitaEsterna" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fornitore" "FornitoreIdentita" NOT NULL,
    "soggetto" VARCHAR(200) NOT NULL,
    "organizzazione" VARCHAR(253) NOT NULL,
    "etichetta" VARCHAR(254),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usataAt" TIMESTAMP(3),

    CONSTRAINT "IdentitaEsterna_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentitaEsterna_fornitore_soggetto_key" ON "IdentitaEsterna"("fornitore", "soggetto");
CREATE UNIQUE INDEX "IdentitaEsterna_userId_fornitore_key" ON "IdentitaEsterna"("userId", "fornitore");

ALTER TABLE "IdentitaEsterna" ADD CONSTRAINT "IdentitaEsterna_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IdentitaEsterna" ADD CONSTRAINT "IdentitaEsterna_check" CHECK (
  length(btrim("soggetto")) > 0 AND length(btrim("organizzazione")) > 0
);
