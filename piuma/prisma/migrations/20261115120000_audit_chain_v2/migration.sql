-- Одит-верига v2 (адитивно): версия на записа и HMAC етикет на IP адреса.
-- Старите записи получават v = 1 и се проверяват по старата формула (SHA-256 без ключ).

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "ipTag" TEXT,
ADD COLUMN     "v" INTEGER NOT NULL DEFAULT 1;
