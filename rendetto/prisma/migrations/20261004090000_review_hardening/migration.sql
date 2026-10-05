-- Втвърдяване след прегледа: изходът на отказа от договора се пази (повторното писмо и панелът го
-- четат, вместо да го извеждат наново); индекси за справките по IP, по targetId в одита и за почасовото
-- чистене на устройствата; неизползваният индекс по отпечатъка на всеки опит за вход отпада. Само
-- адитивно: нито колона, нито данни се трият.

-- DropIndex
DROP INDEX "LoginEvent_fingerprintHash_idx";

-- DropIndex
DROP INDEX "AuditLog_targetType_targetId_idx";

-- AlterTable
ALTER TABLE "UpgradeRequest" ADD COLUMN     "withdrawalOutcome" TEXT;

-- CreateIndex
CREATE INDEX "User_lastLoginIp_idx" ON "User"("lastLoginIp");

-- CreateIndex
CREATE INDEX "Device_lastSeenAt_idx" ON "Device"("lastSeenAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetId_idx" ON "AuditLog"("targetId");
