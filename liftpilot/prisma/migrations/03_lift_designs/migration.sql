-- The installation entered once: the one form, and the shaft design and the calculation made from it (LiftDesign).

-- CreateTable
CREATE TABLE "LiftDesign" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "label" TEXT,
    "inputs" JSONB NOT NULL,
    "source" JSONB,
    "shaftDesignId" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "failCount" INTEGER NOT NULL,
    "warnCount" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiftDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiftDesign_shaftDesignId_key" ON "LiftDesign"("shaftDesignId");

-- CreateIndex
CREATE UNIQUE INDEX "LiftDesign_calculationId_key" ON "LiftDesign"("calculationId");

-- CreateIndex
CREATE INDEX "LiftDesign_projectId_createdAt_idx" ON "LiftDesign"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "LiftDesign_companyId_idx" ON "LiftDesign"("companyId");

-- CreateIndex
CREATE INDEX "LiftDesign_userId_idx" ON "LiftDesign"("userId");

-- AddForeignKey
ALTER TABLE "LiftDesign" ADD CONSTRAINT "LiftDesign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftDesign" ADD CONSTRAINT "LiftDesign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftDesign" ADD CONSTRAINT "LiftDesign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftDesign" ADD CONSTRAINT "LiftDesign_shaftDesignId_fkey" FOREIGN KEY ("shaftDesignId") REFERENCES "ShaftDesign"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftDesign" ADD CONSTRAINT "LiftDesign_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "Calculation"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- A lift design is an immutable record, as a calculation: refuse every UPDATE except the author becoming NULL when
-- that user is deleted (ON DELETE SET NULL).
CREATE FUNCTION "lift_design_immutable"() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'userId') = (to_jsonb(OLD) - 'userId')
     AND (NEW."userId" IS NOT DISTINCT FROM OLD."userId" OR NEW."userId" IS NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LiftDesign % is immutable', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LiftDesign_no_update" BEFORE UPDATE ON "LiftDesign" FOR EACH ROW EXECUTE FUNCTION "lift_design_immutable"();
