-- Регистърът на клиентите на фирмата (собственикът, 13 ноември 2026): профилът на клиента и връзката от
-- офертата към него. Само добавя; досегашните оферти остават без връзка (данните на клиента са в самите тях).

-- AlterTable
ALTER TABLE "Preventivo" ADD COLUMN     "clienteId" TEXT;

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "nome" VARCHAR(200) NOT NULL,
    "indirizzo" VARCHAR(300),
    "piva" VARCHAR(20),
    "email" VARCHAR(254),
    "telefono" VARCHAR(40),
    "referente" VARCHAR(120),
    "note" VARCHAR(2000),
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cliente_aziendaId_nome_idx" ON "Cliente"("aziendaId", "nome");

-- CreateIndex
CREATE INDEX "Preventivo_clienteId_idx" ON "Preventivo"("clienteId");

-- AddForeignKey
ALTER TABLE "Preventivo" ADD CONSTRAINT "Preventivo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Името не е празно (формата го иска; базата го пази и при запис на ръка).
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_nome_check" CHECK (btrim("nome") <> '');
