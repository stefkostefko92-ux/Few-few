-- Обратна връзка към знанието (FR-10, §11.3) и опции на таблото в приложимостта (FR-01).
-- Само адитивно: две нови enum, нова таблица с индекс на всеки FK, нова колона с подразбиране.

-- CreateEnum
CREATE TYPE "ProposalSource" AS ENUM ('FEEDBACK', 'SOLVED_CASE', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('NEW', 'IN_REVIEW', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "DocumentApplicability" ADD COLUMN     "options" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "KnowledgeProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" "ProposalSource" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'NEW',
    "caseId" TEXT,
    "messageId" TEXT,
    "feedbackId" TEXT,
    "rating" "FeedbackRating",
    "comment" TEXT,
    "dedupeKey" TEXT,
    "conflict" JSONB,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draftDocumentId" TEXT,
    "resultDocumentId" TEXT,
    "resultErrorId" TEXT,
    "createdById" TEXT,
    "reviewerId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeProposal_tenantId_status_createdAt_idx" ON "KnowledgeProposal"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeProposal_tenantId_source_idx" ON "KnowledgeProposal"("tenantId", "source");

-- CreateIndex
CREATE INDEX "KnowledgeProposal_tenantId_dedupeKey_idx" ON "KnowledgeProposal"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "KnowledgeProposal_caseId_idx" ON "KnowledgeProposal"("caseId");

-- CreateIndex
CREATE INDEX "KnowledgeProposal_messageId_idx" ON "KnowledgeProposal"("messageId");

-- CreateIndex
CREATE INDEX "KnowledgeProposal_feedbackId_idx" ON "KnowledgeProposal"("feedbackId");

-- CreateIndex
CREATE INDEX "KnowledgeProposal_draftDocumentId_idx" ON "KnowledgeProposal"("draftDocumentId");

-- CreateIndex
CREATE INDEX "KnowledgeProposal_resultDocumentId_idx" ON "KnowledgeProposal"("resultDocumentId");

-- CreateIndex
CREATE INDEX "KnowledgeProposal_resultErrorId_idx" ON "KnowledgeProposal"("resultErrorId");

-- AddForeignKey
ALTER TABLE "KnowledgeProposal" ADD CONSTRAINT "KnowledgeProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeProposal" ADD CONSTRAINT "KnowledgeProposal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeProposal" ADD CONSTRAINT "KnowledgeProposal_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CaseMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeProposal" ADD CONSTRAINT "KnowledgeProposal_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeProposal" ADD CONSTRAINT "KnowledgeProposal_draftDocumentId_fkey" FOREIGN KEY ("draftDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeProposal" ADD CONSTRAINT "KnowledgeProposal_resultDocumentId_fkey" FOREIGN KEY ("resultDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeProposal" ADD CONSTRAINT "KnowledgeProposal_resultErrorId_fkey" FOREIGN KEY ("resultErrorId") REFERENCES "ErrorCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Опциите на правилото са JSON обект (ключ → стойност), никога масив/скалар: съвпадението е
-- „всяка двойка на правилото = опцията на случая“ (retrieval/applicability.ts, store/scope.ts).
ALTER TABLE "DocumentApplicability" ADD CONSTRAINT "DocumentApplicability_options_object" CHECK (jsonb_typeof("options") = 'object');

