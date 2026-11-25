-- Опашката към НАП (SPEC 63): събитие (издаден/анулиран) и разбивка по ставки. Уникалността минава от
-- documentId към (documentId, event) — индексът се сменя, данните остават (старите редове са ISSUED).
-- DropIndex
DROP INDEX "NraReport_documentId_key";

-- AlterTable
ALTER TABLE "NraReport" ADD COLUMN     "breakdown" JSONB,
ADD COLUMN     "event" TEXT NOT NULL DEFAULT 'ISSUED';

-- CreateIndex
CREATE UNIQUE INDEX "NraReport_documentId_event_key" ON "NraReport"("documentId", "event");

