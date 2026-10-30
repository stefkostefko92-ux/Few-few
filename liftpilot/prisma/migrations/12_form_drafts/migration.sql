-- Round 26: a form's draft — the values of the installation's one form, of a replacement's calculator or of a
-- calculation's machine room survey as they are being entered, with those still to enter, kept while the designer is
-- away. Replaced as the form changes, deleted when the record is saved or the draft discarded. Not a record: nothing
-- derived, no hash, no immutability trigger.

-- CreateTable
CREATE TABLE "FormDraft" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormDraft_companyId_idx" ON "FormDraft"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FormDraft_projectId_scope_key" ON "FormDraft"("projectId", "scope");

-- AddForeignKey
ALTER TABLE "FormDraft" ADD CONSTRAINT "FormDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDraft" ADD CONSTRAINT "FormDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

