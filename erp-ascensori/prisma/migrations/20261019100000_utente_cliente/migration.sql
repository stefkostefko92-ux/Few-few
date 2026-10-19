-- Акаунт на ниво CLIENTE, свързан с администратор: „Area cliente" показва само
-- неговите кондоминиуми, импианти, срокове, отворени ордини и фактури.
-- Добавяща промяна: нова колона с NULL. Изтрит администратор → връзката пада
-- (SET NULL), акаунтът остава, но не вижда нищо.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "amministratoreId" UUID;

-- CreateIndex
CREATE INDEX "users_amministratoreId_idx" ON "users"("amministratoreId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_amministratoreId_fkey" FOREIGN KEY ("amministratoreId") REFERENCES "amministratori"("id") ON DELETE SET NULL ON UPDATE CASCADE;
