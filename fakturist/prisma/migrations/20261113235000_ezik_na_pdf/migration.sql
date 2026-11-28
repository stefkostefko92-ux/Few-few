-- Езикът на PDF копието: български или двуезичен (български + английски). Само добавя.
-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "pdfLanguage" TEXT NOT NULL DEFAULT 'bg';

-- AlterTable
ALTER TABLE "RecurringInvoice" ADD COLUMN     "pdfLanguage" TEXT NOT NULL DEFAULT 'bg';

