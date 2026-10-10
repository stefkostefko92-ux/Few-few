-- CreateEnum
CREATE TYPE "TicketQueue" AS ENUM ('SUPPORT', 'ENGINEERING');

-- CreateEnum
CREATE TYPE "HandoffDirection" AS ENUM ('TO_OPERATOR', 'TO_ENGINEERING', 'TO_AI');

-- CreateEnum
CREATE TYPE "StepResult" AS ENUM ('OK', 'KO', 'NOT_POSSIBLE');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('NONE', 'SELF', 'SUPPORT', 'ENGINEERING');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'GRANTED', 'DENIED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "aiPaused" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "queue" "TicketQueue" NOT NULL DEFAULT 'SUPPORT',
ADD COLUMN     "resolution" JSONB;

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" "TicketStatus",
    "toStatus" "TicketStatus",
    "payload" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketInfoRequest" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "answeredMessageId" TEXT,

    CONSTRAINT "TicketInfoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseHandoff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "ticketId" TEXT,
    "direction" "HandoffDirection" NOT NULL,
    "reason" TEXT NOT NULL,
    "summary" JSONB,
    "fromUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepApprovalPolicy" (
    "tenantId" TEXT NOT NULL,
    "safetyRelevant" "ApprovalLevel" NOT NULL DEFAULT 'SUPPORT',
    "configurative" "ApprovalLevel" NOT NULL DEFAULT 'NONE',
    "ttlMinutes" INTEGER NOT NULL DEFAULT 480,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepApprovalPolicy_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "StepApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "stepHash" TEXT NOT NULL,
    "actionClass" "ActionClass" NOT NULL,
    "gateVersion" TEXT NOT NULL,
    "level" "ApprovalLevel" NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestNote" TEXT,
    "selfAttested" BOOLEAN NOT NULL DEFAULT false,
    "decidedById" TEXT,
    "decidedRole" "Role",
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStepExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "stepHash" TEXT NOT NULL,
    "actionClass" "ActionClass" NOT NULL,
    "gateVersion" TEXT NOT NULL,
    "result" "StepResult" NOT NULL,
    "note" TEXT,
    "approvalId" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseStepExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketEvent_ticketId_at_idx" ON "TicketEvent"("ticketId", "at");

-- CreateIndex
CREATE INDEX "TicketEvent_tenantId_at_idx" ON "TicketEvent"("tenantId", "at");

-- CreateIndex
CREATE INDEX "TicketInfoRequest_ticketId_createdAt_idx" ON "TicketInfoRequest"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseHandoff_caseId_createdAt_idx" ON "CaseHandoff"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseHandoff_ticketId_idx" ON "CaseHandoff"("ticketId");

-- CreateIndex
CREATE INDEX "CaseHandoff_tenantId_createdAt_idx" ON "CaseHandoff"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "StepApproval_tenantId_status_createdAt_idx" ON "StepApproval"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StepApproval_caseId_idx" ON "StepApproval"("caseId");

-- CreateIndex
CREATE INDEX "StepApproval_messageId_step_idx" ON "StepApproval"("messageId", "step");

-- CreateIndex
CREATE INDEX "StepApproval_requestedById_idx" ON "StepApproval"("requestedById");

-- CreateIndex
CREATE INDEX "StepApproval_decidedById_idx" ON "StepApproval"("decidedById");

-- CreateIndex
CREATE INDEX "CaseStepExecution_caseId_createdAt_idx" ON "CaseStepExecution"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseStepExecution_messageId_step_idx" ON "CaseStepExecution"("messageId", "step");

-- CreateIndex
CREATE INDEX "CaseStepExecution_approvalId_idx" ON "CaseStepExecution"("approvalId");

-- CreateIndex
CREATE INDEX "CaseStepExecution_authorId_idx" ON "CaseStepExecution"("authorId");

-- CreateIndex
CREATE INDEX "CaseStepExecution_tenantId_idx" ON "CaseStepExecution"("tenantId");

-- CreateIndex
CREATE INDEX "Ticket_status_queue_createdAt_idx" ON "Ticket"("status", "queue", "createdAt");

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketInfoRequest" ADD CONSTRAINT "TicketInfoRequest_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandoff" ADD CONSTRAINT "CaseHandoff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandoff" ADD CONSTRAINT "CaseHandoff_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandoff" ADD CONSTRAINT "CaseHandoff_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepApprovalPolicy" ADD CONSTRAINT "StepApprovalPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepApproval" ADD CONSTRAINT "StepApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepApproval" ADD CONSTRAINT "StepApproval_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepApproval" ADD CONSTRAINT "StepApproval_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CaseMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStepExecution" ADD CONSTRAINT "CaseStepExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStepExecution" ADD CONSTRAINT "CaseStepExecution_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStepExecution" ADD CONSTRAINT "CaseStepExecution_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CaseMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStepExecution" ADD CONSTRAINT "CaseStepExecution_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "StepApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

