-- DropForeignKey
ALTER TABLE "NraReport" DROP CONSTRAINT "NraReport_documentId_fkey";

-- CreateTable
CREATE TABLE "IssueSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssueSubmission_documentId_key" ON "IssueSubmission"("documentId");

-- CreateIndex
CREATE INDEX "IssueSubmission_organizationId_idx" ON "IssueSubmission"("organizationId");

-- CreateIndex
CREATE INDEX "IssueSubmission_createdAt_idx" ON "IssueSubmission"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IssueSubmission_userId_token_key" ON "IssueSubmission"("userId", "token");

-- AddForeignKey
ALTER TABLE "NraReport" ADD CONSTRAINT "NraReport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueSubmission" ADD CONSTRAINT "IssueSubmission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

