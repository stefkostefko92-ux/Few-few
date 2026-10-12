-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PORTAL_TECHNICIAN', 'INTERNAL_TECHNICIAN', 'SUPPORT', 'ENGINEERING', 'KNOWLEDGE_OWNER', 'TENANT_ADMIN', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('INTERNAL', 'PORTAL');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('MANUAL', 'SCHEMATIC', 'ERROR_LIST', 'FAQ', 'BULLETIN', 'PROCEDURE', 'SOLVED_CASE');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('PORTAL', 'INTERNAL', 'ENGINEERING');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARNING', 'FAULT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ActionClass" AS ENUM ('INFORMATIVE', 'DIAGNOSTIC', 'CONFIGURATIVE', 'SAFETY_RELEVANT', 'DIRECT_COMMAND');

-- CreateEnum
CREATE TYPE "ErrorRelationKind" AS ENUM ('SYMPTOM', 'CAUSE', 'CHECK', 'FIX');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'AI_IN_PROGRESS', 'WAITING_TECHNICIAN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CaseOutcome" AS ENUM ('RESOLVED', 'NOT_RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('HUMAN', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeedbackRating" AS ENUM ('USEFUL', 'NOT_USEFUL', 'TECHNICAL_ERROR');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "locale" TEXT NOT NULL DEFAULT 'it',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRevision" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "hwRevision" TEXT NOT NULL,
    "fwMin" TEXT NOT NULL,
    "fwMax" TEXT,

    CONSTRAINT "ProductRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "serial" TEXT NOT NULL,
    "productRevisionId" TEXT NOT NULL,
    "firmware" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "qrTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "language" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "Audience" NOT NULL DEFAULT 'INTERNAL',
    "safetyRelevant" BOOLEAN NOT NULL DEFAULT false,
    "subsystem" TEXT,
    "sourceFilename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "uploadedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "deprecatedAt" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentApplicability" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "hwRevision" TEXT,
    "fwMin" TEXT,
    "fwMax" TEXT,

    CONSTRAINT "DocumentApplicability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "page" INTEGER NOT NULL,
    "section" TEXT,
    "text" TEXT NOT NULL,
    "componentRefs" TEXT[],
    "errorCodes" TEXT[],
    "tsv" tsvector,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "subsystem" TEXT,
    "severity" "Severity" NOT NULL,
    "safetyRelevant" BOOLEAN NOT NULL DEFAULT false,
    "hwRevision" TEXT,
    "fwMin" TEXT,
    "fwMax" TEXT,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceDocumentId" TEXT,
    "sourcePage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErrorCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorRelation" (
    "id" TEXT NOT NULL,
    "errorId" TEXT NOT NULL,
    "kind" "ErrorRelationKind" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "expected" TEXT,
    "actionClass" "ActionClass" NOT NULL DEFAULT 'INFORMATIVE',
    "sourceDocumentId" TEXT,
    "sourcePage" INTEGER,

    CONSTRAINT "ErrorRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "companyId" TEXT,
    "deviceId" TEXT,
    "portal" BOOLEAN NOT NULL DEFAULT false,
    "context" JSONB NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "outcome" "CaseOutcome",
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseMessage" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "knowledgeSnapshotId" TEXT,
    "promptVersion" TEXT,
    "clientMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "documentId" TEXT,
    "chunkId" TEXT,
    "errorId" TEXT,
    "page" INTEGER,
    "quote" TEXT,

    CONSTRAINT "CaseEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseTimelineEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "reason" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" "FeedbackRating" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "detail" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Company_tenantId_idx" ON "Company"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tenantId_name_key" ON "Company"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Product_tenantId_family_idx" ON "Product"("tenantId", "family");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_model_key" ON "Product"("tenantId", "model");

-- CreateIndex
CREATE INDEX "ProductRevision_productId_idx" ON "ProductRevision"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRevision_productId_hwRevision_key" ON "ProductRevision"("productId", "hwRevision");

-- CreateIndex
CREATE UNIQUE INDEX "Device_qrTokenHash_key" ON "Device"("qrTokenHash");

-- CreateIndex
CREATE INDEX "Device_companyId_idx" ON "Device"("companyId");

-- CreateIndex
CREATE INDEX "Device_productRevisionId_idx" ON "Device"("productRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tenantId_serial_key" ON "Device"("tenantId", "serial");

-- CreateIndex
CREATE INDEX "Document_tenantId_status_idx" ON "Document"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Document_supersedesId_idx" ON "Document"("supersedesId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_tenantId_code_revision_key" ON "Document"("tenantId", "code", "revision");

-- CreateIndex
CREATE INDEX "DocumentApplicability_documentId_idx" ON "DocumentApplicability"("documentId");

-- CreateIndex
CREATE INDEX "DocumentApplicability_productId_idx" ON "DocumentApplicability"("productId");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_page_idx" ON "DocumentChunk"("documentId", "page");

-- CreateIndex
CREATE INDEX "DocumentChunk_tsv_idx" ON "DocumentChunk" USING GIN ("tsv");

-- CreateIndex
CREATE INDEX "DocumentChunk_componentRefs_idx" ON "DocumentChunk" USING GIN ("componentRefs");

-- CreateIndex
CREATE INDEX "DocumentChunk_errorCodes_idx" ON "DocumentChunk" USING GIN ("errorCodes");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_ordinal_key" ON "DocumentChunk"("documentId", "ordinal");

-- CreateIndex
CREATE INDEX "ErrorCode_tenantId_code_idx" ON "ErrorCode"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ErrorCode_productId_code_idx" ON "ErrorCode"("productId", "code");

-- CreateIndex
CREATE INDEX "ErrorCode_sourceDocumentId_idx" ON "ErrorCode"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "ErrorRelation_errorId_idx" ON "ErrorRelation"("errorId");

-- CreateIndex
CREATE INDEX "KnowledgeSnapshot_tenantId_idx" ON "KnowledgeSnapshot"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_number_key" ON "Case"("number");

-- CreateIndex
CREATE INDEX "Case_tenantId_status_idx" ON "Case"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Case_companyId_idx" ON "Case"("companyId");

-- CreateIndex
CREATE INDEX "Case_deviceId_idx" ON "Case"("deviceId");

-- CreateIndex
CREATE INDEX "Case_createdById_idx" ON "Case"("createdById");

-- CreateIndex
CREATE INDEX "CaseMessage_caseId_createdAt_idx" ON "CaseMessage"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseMessage_knowledgeSnapshotId_idx" ON "CaseMessage"("knowledgeSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseMessage_caseId_clientMessageId_key" ON "CaseMessage"("caseId", "clientMessageId");

-- CreateIndex
CREATE INDEX "CaseEvidence_caseId_idx" ON "CaseEvidence"("caseId");

-- CreateIndex
CREATE INDEX "CaseEvidence_messageId_idx" ON "CaseEvidence"("messageId");

-- CreateIndex
CREATE INDEX "CaseEvidence_documentId_idx" ON "CaseEvidence"("documentId");

-- CreateIndex
CREATE INDEX "CaseTimelineEvent_caseId_at_idx" ON "CaseTimelineEvent"("caseId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_caseId_key" ON "Ticket"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_number_key" ON "Ticket"("number");

-- CreateIndex
CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_messageId_userId_key" ON "Feedback"("messageId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_hash_key" ON "AuditEvent"("hash");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_at_idx" ON "AuditEvent"("tenantId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRevision" ADD CONSTRAINT "ProductRevision_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApplicability" ADD CONSTRAINT "DocumentApplicability_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApplicability" ADD CONSTRAINT "DocumentApplicability_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorCode" ADD CONSTRAINT "ErrorCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorCode" ADD CONSTRAINT "ErrorCode_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorRelation" ADD CONSTRAINT "ErrorRelation_errorId_fkey" FOREIGN KEY ("errorId") REFERENCES "ErrorCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMessage" ADD CONSTRAINT "CaseMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMessage" ADD CONSTRAINT "CaseMessage_knowledgeSnapshotId_fkey" FOREIGN KEY ("knowledgeSnapshotId") REFERENCES "KnowledgeSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvidence" ADD CONSTRAINT "CaseEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvidence" ADD CONSTRAINT "CaseEvidence_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CaseMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTimelineEvent" ADD CONSTRAINT "CaseTimelineEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CaseMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
