-- Заявките за достъп от публичната страница: регистрация няма — фирмата пита, MASTER решава и при „да“
-- създава фирмата и кани администратора ѝ. Написана на ръка върху `prisma migrate diff`; таблицата е нова,
-- нищо съществуващо не се променя.

-- CreateEnum
CREATE TYPE "TeamSize" AS ENUM ('S1_5', 'S6_20', 'S21_50', 'S50_PLUS');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('NEW', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "company" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(40),
    "city" VARCHAR(120),
    "teamSize" "TeamSize",
    "message" VARCHAR(2000),
    "locale" VARCHAR(5) NOT NULL DEFAULT 'it',
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'NEW',
    "aziendaId" TEXT,
    "inviteId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessRequest_inviteId_key" ON "AccessRequest"("inviteId");

-- CreateIndex
CREATE INDEX "AccessRequest_status_createdAt_idx" ON "AccessRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AccessRequest_email_idx" ON "AccessRequest"("email");

-- CreateIndex
CREATE INDEX "AccessRequest_aziendaId_idx" ON "AccessRequest"("aziendaId");

-- CreateIndex
CREATE INDEX "AccessRequest_decidedById_idx" ON "AccessRequest"("decidedById");

-- CreateIndex
CREATE INDEX "AccessRequest_updatedAt_idx" ON "AccessRequest"("updatedAt");

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_aziendaId_fkey" FOREIGN KEY ("aziendaId") REFERENCES "Azienda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "Invite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Решената заявка има дата на решението, новата — не.
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_decided_check"
  CHECK (("status" = 'NEW') = ("decidedAt" IS NULL));
-- Имейлът е с малки букви (src/auth/email.ts), а езикът е един от трите на портала.
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_email_check" CHECK ("email" = lower("email"));
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_locale_check"
  CHECK ("locale" IN ('it', 'bg', 'en'));
