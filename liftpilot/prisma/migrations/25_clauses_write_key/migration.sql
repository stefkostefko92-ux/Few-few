-- Round 48 (after the review): User.clausesApprovedAt — when the owner approved the clauses of arts. 1341–1342 c.c.
-- with the password (null: never so, the app asks for it once); Scheda.writeKey — the key the form sent with the last
-- write, unique per company, so a save sent again after its answer was lost finds the sheet it already wrote. Additive:
-- two nullable columns and a unique index over (companyId, writeKey) where every existing row is NULL (no conflict).
-- Back: DROP INDEX "Scheda_companyId_writeKey_key"; ALTER TABLE "Scheda" DROP COLUMN "writeKey";
-- ALTER TABLE "User" DROP COLUMN "clausesApprovedAt".

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN     "writeKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clausesApprovedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Scheda_companyId_writeKey_key" ON "Scheda"("companyId", "writeKey");
