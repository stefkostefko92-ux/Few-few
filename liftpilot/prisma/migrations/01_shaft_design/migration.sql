-- Shaft designs: the plan of the shaft, car, doors and counterweight (src/shaft), immutable like calculations; a
-- calculation may start from one. Additive only: no existing row changes.

-- CreateTable
CREATE TABLE "ShaftDesign" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "label" TEXT,
    "engineVersion" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "source" JSONB,
    "inputs" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "sha256" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "failCount" INTEGER NOT NULL,
    "warnCount" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShaftDesign_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Calculation" ADD COLUMN "shaftDesignId" TEXT;

-- CreateIndex
CREATE INDEX "ShaftDesign_projectId_createdAt_idx" ON "ShaftDesign"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ShaftDesign_companyId_idx" ON "ShaftDesign"("companyId");

-- CreateIndex
CREATE INDEX "ShaftDesign_userId_idx" ON "ShaftDesign"("userId");

-- CreateIndex
CREATE INDEX "Calculation_shaftDesignId_idx" ON "Calculation"("shaftDesignId");

-- AddForeignKey
ALTER TABLE "ShaftDesign" ADD CONSTRAINT "ShaftDesign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShaftDesign" ADD CONSTRAINT "ShaftDesign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShaftDesign" ADD CONSTRAINT "ShaftDesign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: NO ACTION, checked at the end of the statement, so that deleting a project removes its calculations
-- and designs together without ever updating an (immutable) calculation
ALTER TABLE "Calculation" ADD CONSTRAINT "Calculation_shaftDesignId_fkey" FOREIGN KEY ("shaftDesignId") REFERENCES "ShaftDesign"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- A saved shaft design is an immutable snapshot, as a calculation: refuse every UPDATE except the author link
-- becoming NULL when the user is deleted (ON DELETE SET NULL, e.g. an erasure request).
CREATE FUNCTION "shaft_design_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."userId" IS NOT NULL AND NEW."userId" IS NULL AND (to_jsonb(NEW) - 'userId') = (to_jsonb(OLD) - 'userId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ShaftDesign % is immutable', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ShaftDesign_no_update" BEFORE UPDATE ON "ShaftDesign" FOR EACH ROW EXECUTE FUNCTION "shaft_design_immutable"();
