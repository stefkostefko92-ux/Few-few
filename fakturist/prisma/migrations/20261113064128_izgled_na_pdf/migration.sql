-- CreateTable
CREATE TABLE "PdfStyle" (
    "organizationId" TEXT NOT NULL,
    "logo" BYTEA,
    "logoType" TEXT,
    "logoWidth" INTEGER,
    "logoHeight" INTEGER,
    "font" TEXT NOT NULL DEFAULT 'dejavu-sans',
    "template" TEXT NOT NULL DEFAULT 'classic',
    "accent" TEXT NOT NULL DEFAULT '#0b6b52',
    "logoPosition" TEXT NOT NULL DEFAULT 'left',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PdfStyle_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE INDEX "PdfStyle_updatedById_idx" ON "PdfStyle"("updatedById");

-- AddForeignKey
ALTER TABLE "PdfStyle" ADD CONSTRAINT "PdfStyle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfStyle" ADD CONSTRAINT "PdfStyle_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
