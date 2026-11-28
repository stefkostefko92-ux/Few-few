-- CreateTable
CREATE TABLE "Impostazione" (
    "chiave" TEXT NOT NULL,
    "valore" JSONB NOT NULL,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,
    "autoreId" TEXT,

    CONSTRAINT "Impostazione_pkey" PRIMARY KEY ("chiave")
);

