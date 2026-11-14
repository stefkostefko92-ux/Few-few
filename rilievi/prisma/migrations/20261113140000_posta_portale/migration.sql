-- Пощата на портала, настроена от MASTER (#32). Само добавя.
CREATE TABLE "PostaPortale" (
    "id" VARCHAR(10) NOT NULL DEFAULT 'posta',
    "host" VARCHAR(253) NOT NULL,
    "porta" INTEGER NOT NULL,
    "utente" VARCHAR(254) NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "mittenteNome" VARCHAR(80) NOT NULL,
    "mittenteEmail" VARCHAR(254) NOT NULL,
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PostaPortale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PostaPortale_updatedById_idx" ON "PostaPortale"("updatedById");

ALTER TABLE "PostaPortale" ADD CONSTRAINT "PostaPortale_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Един ред; портовете на Brevo; нищо празно.
ALTER TABLE "PostaPortale" ADD CONSTRAINT "PostaPortale_check" CHECK (
  "id" = 'posta'
  AND "porta" IN (465, 587, 2525)
  AND length(btrim("host")) > 0
  AND length(btrim("utente")) > 0
  AND length("passwordEnc") > 0
  AND length(btrim("mittenteNome")) > 0
  AND length(btrim("mittenteEmail")) > 0
);
