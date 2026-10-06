-- What an installation is for: the machine replacement alone, or a whole project.
CREATE TYPE "ProjectKind" AS ENUM ('REPLACEMENT', 'FULL');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "kind" "ProjectKind" NOT NULL DEFAULT 'FULL';

-- The installations made so far with calculations only (no shaft design, lift design or drawing set) were machine
-- replacements.
UPDATE "Project" AS p SET "kind" = 'REPLACEMENT'
WHERE EXISTS (SELECT 1 FROM "Calculation" c WHERE c."projectId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "ShaftDesign" s WHERE s."projectId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "LiftDesign" l WHERE l."projectId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "DrawingSet" d WHERE d."projectId" = p."id");

-- CreateIndex
CREATE INDEX "Project_companyId_kind_idx" ON "Project"("companyId", "kind");
