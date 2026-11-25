-- Поръчки със задължение за плащане: кой купува (потребител/фирма), изричното искане за ранно
-- начало, версията на общите условия и отказът от договора (чл. 11а от Директива 2011/83).
-- Планът, активиран от поръчка, помни коя е тя — при отказ се връща към състоянието преди нея.

-- CreateEnum
CREATE TYPE "BuyerType" AS ENUM ('CONSUMER', 'BUSINESS');

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "PlanChange" ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "UpgradeRequest" ADD COLUMN     "buyerType" "BuyerType" NOT NULL DEFAULT 'CONSUMER',
ADD COLUMN     "confirmationSentAt" TIMESTAMP(3),
ADD COLUMN     "earlyStartRequestedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT,
ADD COLUMN     "withdrawalAckSentAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PlanChange_requestId_idx" ON "PlanChange"("requestId");

-- AddForeignKey
ALTER TABLE "PlanChange" ADD CONSTRAINT "PlanChange_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "UpgradeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

