-- Сверка с банката и входящи е-фактури (SPEC 54–55). Само добавя.
-- CreateEnum
CREATE TYPE "IncomingStatus" AS ENUM ('RECEIVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "BankLineStatus" AS ENUM ('NEW', 'MATCHED', 'IGNORED');

-- CreateTable
CREATE TABLE "IncomingInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fileName" TEXT,
    "xml" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierEik" TEXT,
    "supplierVat" TEXT,
    "number" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "issueDate" DATE,
    "dueDate" DATE,
    "currency" TEXT NOT NULL,
    "payableCents" BIGINT NOT NULL,
    "vatCents" BIGINT NOT NULL,
    "issues" JSONB NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "status" "IncomingStatus" NOT NULL DEFAULT 'RECEIVED',
    "paidAt" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fileName" TEXT,
    "sha256" TEXT NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "newLines" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "bookingDate" DATE NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "counterparty" TEXT,
    "counterpartyIban" TEXT,
    "remittance" TEXT NOT NULL,
    "bankRef" TEXT,
    "uniqueKey" TEXT NOT NULL,
    "status" "BankLineStatus" NOT NULL DEFAULT 'NEW',
    "documentPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomingInvoice_organizationId_status_dueDate_idx" ON "IncomingInvoice"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "IncomingInvoice_createdById_idx" ON "IncomingInvoice"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingInvoice_organizationId_sha256_key" ON "IncomingInvoice"("organizationId", "sha256");

-- CreateIndex
CREATE INDEX "BankStatement_createdById_idx" ON "BankStatement"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_organizationId_sha256_key" ON "BankStatement"("organizationId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "BankLine_documentPaymentId_key" ON "BankLine"("documentPaymentId");

-- CreateIndex
CREATE INDEX "BankLine_organizationId_status_idx" ON "BankLine"("organizationId", "status");

-- CreateIndex
CREATE INDEX "BankLine_statementId_idx" ON "BankLine"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "BankLine_organizationId_uniqueKey_key" ON "BankLine"("organizationId", "uniqueKey");

-- AddForeignKey
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankLine" ADD CONSTRAINT "BankLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankLine" ADD CONSTRAINT "BankLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankLine" ADD CONSTRAINT "BankLine_documentPaymentId_fkey" FOREIGN KEY ("documentPaymentId") REFERENCES "DocumentPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

