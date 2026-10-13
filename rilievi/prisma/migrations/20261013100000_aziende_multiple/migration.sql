-- Човек в няколко фирми, с различна роля във всяка: членство (човек, фирма, роля) вместо една фирма и
-- една роля в "User". Данните се пренасят в същата миграция (една транзакция): всеки досегашен човек
-- остава в своята фирма със своята роля, MASTER остава собственик (флаг) без фирма.

-- CreateTable
CREATE TABLE "Membership" (
    "userId" TEXT NOT NULL,
    "aziendaId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","aziendaId")
);

-- MASTER не е роля във фирма.
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_role_check" CHECK ("role" <> 'MASTER');

-- CreateIndex
CREATE INDEX "Membership_aziendaId_idx" ON "Membership"("aziendaId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Пренасяне: досегашната фирма и роля на всеки човек извън MASTER ("User_azienda_role_check" гарантира,
-- че всеки от тях има фирма).
INSERT INTO "Membership" ("userId", "aziendaId", "role", "createdAt")
SELECT "id", "aziendaId", "role", "createdAt" FROM "User" WHERE "role" <> 'MASTER' AND "aziendaId" IS NOT NULL;

-- Собственикът на портала: флаг вместо роля.
ALTER TABLE "User" ADD COLUMN "master" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "master" = true WHERE "role" = 'MASTER';

-- Старите колони — данните им вече са в "Membership" и в "master".
ALTER TABLE "User" DROP CONSTRAINT "User_azienda_role_check";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_aziendaId_fkey";

-- DropIndex
DROP INDEX "User_aziendaId_idx";

-- DropIndex
DROP INDEX "User_role_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "aziendaId",
DROP COLUMN "role";

-- CreateIndex
CREATE INDEX "User_master_idx" ON "User"("master");
