-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "clientReportId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Report_clientReportId_key" ON "Report"("clientReportId");

