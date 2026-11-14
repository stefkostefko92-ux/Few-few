-- Страниците по ключ (createdAt/bookingDate, id) в списъците на фирмата — само индекси.
-- CreateIndex
CREATE INDEX "BankLine_organizationId_status_bookingDate_idx" ON "BankLine"("organizationId", "status", "bookingDate");

-- CreateIndex
CREATE INDEX "Document_organizationId_createdAt_idx" ON "Document"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "IncomingInvoice_organizationId_createdAt_idx" ON "IncomingInvoice"("organizationId", "createdAt");

