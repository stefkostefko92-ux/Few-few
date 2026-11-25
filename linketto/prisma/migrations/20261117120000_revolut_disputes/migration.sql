-- Споровете при Revolut (DISPUTE_* уебхуци → GET /api/disputes/{id}): одит
-- на всяко ново известие за спора (състояние, подсъстояние, срок) и връзка с
-- поръчката за план. Само добавяне — нищо съществуващо не се променя.
-- substate/responseDueAt са NOT NULL с подразбиране („“ / 1970-01-01 = „няма“),
-- защото NULL в уникален индекс на Postgres не засича повтор.

-- CreateTable
CREATE TABLE "RevolutDispute" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "substate" TEXT NOT NULL DEFAULT '',
    "reasonCode" TEXT,
    "reason" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "responseDueAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
    "revolutOrderId" TEXT,
    "planOrderId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevolutDispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevolutDispute_planOrderId_idx" ON "RevolutDispute"("planOrderId");

-- CreateIndex
CREATE INDEX "RevolutDispute_notifiedAt_idx" ON "RevolutDispute"("notifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RevolutDispute_disputeId_state_substate_responseDueAt_key" ON "RevolutDispute"("disputeId", "state", "substate", "responseDueAt");

-- AddForeignKey
ALTER TABLE "RevolutDispute" ADD CONSTRAINT "RevolutDispute_planOrderId_fkey" FOREIGN KEY ("planOrderId") REFERENCES "PlanOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
