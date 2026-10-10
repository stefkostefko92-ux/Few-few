-- Укрепване на единния вход (ревю за сигурност SSO-H):
-- * ExternalIdentity.linkMethod — как е направена връзката (EMAIL при вход / SELF от собственика);
--   съществуващите връзки са направени по имейл → EMAIL (администраторите ги правят наново сами).
-- * Session.ssoLinkOnly — сесия с парола в REQUIRED, която стига само до свързването.
-- * SsoDomain — домейнът се ДОКАЗВА (DNS TXT): уникалността на „domain“ става уникалност на
--   доказания домейн (verifiedDomain), за да не блокира недоказана заявка истинския собственик.
--   Съществуващите домейни остават недоказани (fail-closed) — доказват се наново (или през CLI).
-- * SsoLoginState.sessionId — свързването е вързано към сесията, от която е започнато.

-- CreateEnum
CREATE TYPE "SsoLinkMethod" AS ENUM ('EMAIL', 'SELF');

-- DropIndex
DROP INDEX "SsoDomain_domain_key";

-- AlterTable
ALTER TABLE "ExternalIdentity" ADD COLUMN     "linkMethod" "SsoLinkMethod" NOT NULL DEFAULT 'EMAIL';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "ssoLinkOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SsoDomain" ADD COLUMN     "tokenNonce" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedDomain" TEXT;

-- AlterTable
ALTER TABLE "SsoLoginState" ADD COLUMN     "sessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SsoDomain_verifiedDomain_key" ON "SsoDomain"("verifiedDomain");

-- CreateIndex
CREATE INDEX "SsoDomain_domain_idx" ON "SsoDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "SsoDomain_configId_domain_key" ON "SsoDomain"("configId", "domain");

-- CreateIndex
CREATE INDEX "SsoLoginState_sessionId_idx" ON "SsoLoginState"("sessionId");

-- AddForeignKey
ALTER TABLE "SsoLoginState" ADD CONSTRAINT "SsoLoginState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

