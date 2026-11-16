-- AlterTable
ALTER TABLE "TransferInvite" ADD COLUMN     "mandateId" TEXT;

-- CreateIndex
CREATE INDEX "TransferInvite_mandateId_idx" ON "TransferInvite"("mandateId");

-- AddForeignKey
ALTER TABLE "TransferInvite" ADD CONSTRAINT "TransferInvite_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "ClientMandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
