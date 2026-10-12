-- Фирми: всеки акаунт (освен MASTER), покана, карта и одит запис принадлежат на фирма.
-- Написана на ръка върху `prisma migrate diff`: колоните се добавят празни, старите редове
-- (ако има — портал отпреди фирмите) отиват в една „Azienda principale“, чак после стават NOT NULL.

-- CreateTable
CREATE TABLE "Azienda" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "logo" BYTEA,
    "logoType" VARCHAR(20),
    "logoWidth" INTEGER,
    "logoHeight" INTEGER,
    "logoUpdatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Azienda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Azienda_name_key" ON "Azienda"("name");

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aziendaId" TEXT;
ALTER TABLE "Invite" ADD COLUMN     "aziendaId" TEXT;
ALTER TABLE "Scheda" ADD COLUMN     "aziendaId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN     "aziendaId" TEXT;

-- Старите данни: една фирма за всичко, което вече съществува (MASTER остава без фирма).
DO $$
DECLARE
  legacy TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "role" <> 'MASTER')
     OR EXISTS (SELECT 1 FROM "Invite")
     OR EXISTS (SELECT 1 FROM "Scheda") THEN
    -- Като cuid: малки букви и цифри, 25 знака (адресите проверяват /^[a-z0-9]{20,40}$/).
    legacy := 'azienda' || substr(md5(random()::text || clock_timestamp()::text), 1, 18);
    INSERT INTO "Azienda" ("id", "name", "createdAt", "updatedAt")
      VALUES (legacy, 'Azienda principale', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    UPDATE "User" SET "aziendaId" = legacy WHERE "role" <> 'MASTER';
    UPDATE "Invite" SET "aziendaId" = legacy;
    UPDATE "Scheda" SET "aziendaId" = legacy;
    UPDATE "AuditLog" SET "aziendaId" = legacy
      WHERE "actorId" IN (SELECT "id" FROM "User" WHERE "aziendaId" = legacy);
  END IF;
END $$;

ALTER TABLE "Invite" ALTER COLUMN "aziendaId" SET NOT NULL;
ALTER TABLE "Scheda" ALTER COLUMN "aziendaId" SET NOT NULL;

-- MASTER е собственикът на портала и няма фирма; всеки друг е в точно една.
ALTER TABLE "User" ADD CONSTRAINT "User_azienda_role_check"
  CHECK (("role" = 'MASTER') = ("aziendaId" IS NULL));
-- MASTER не се създава с покана.
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_role_check" CHECK ("role" <> 'MASTER');

-- CreateIndex
CREATE INDEX "AuditLog_aziendaId_at_idx" ON "AuditLog"("aziendaId", "at");

-- CreateIndex
CREATE INDEX "Invite_aziendaId_idx" ON "Invite"("aziendaId");

-- CreateIndex
CREATE INDEX "Scheda_aziendaId_deletedAt_idx" ON "Scheda"("aziendaId", "deletedAt");

-- CreateIndex
CREATE INDEX "User_aziendaId_idx" ON "User"("aziendaId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheda" ADD CONSTRAINT "Scheda_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
