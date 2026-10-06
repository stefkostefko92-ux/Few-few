-- Drawing sets (tavole di progetto): the data of the installation on the project, the logos of a company (immutable,
-- one current), the issued sets (immutable, numbered YY-NNN per company and year, revisions as new rows) and the
-- counter of the numbers. Additive only: no existing row changes.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "logoId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "plant" JSONB;

-- CreateTable
CREATE TABLE "CompanyLogo" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyLogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingSet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "shaftDesignId" TEXT NOT NULL,
    "userId" TEXT,
    "logoId" TEXT,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "authorInitials" TEXT NOT NULL,
    "revisions" JSONB NOT NULL,
    "plant" JSONB NOT NULL,
    "projectData" JSONB NOT NULL,
    "companyName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingCounter" (
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DrawingCounter_pkey" PRIMARY KEY ("companyId","year")
);

-- CreateIndex
CREATE INDEX "CompanyLogo_companyId_createdAt_idx" ON "CompanyLogo"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "DrawingSet_projectId_createdAt_idx" ON "DrawingSet"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "DrawingSet_calculationId_idx" ON "DrawingSet"("calculationId");

-- CreateIndex
CREATE INDEX "DrawingSet_shaftDesignId_idx" ON "DrawingSet"("shaftDesignId");

-- CreateIndex
CREATE INDEX "DrawingSet_userId_idx" ON "DrawingSet"("userId");

-- CreateIndex
CREATE INDEX "DrawingSet_logoId_idx" ON "DrawingSet"("logoId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingSet_companyId_year_seq_revision_key" ON "DrawingSet"("companyId", "year", "seq", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Company_logoId_key" ON "Company"("logoId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "CompanyLogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLogo" ADD CONSTRAINT "CompanyLogo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "Calculation"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_shaftDesignId_fkey" FOREIGN KEY ("shaftDesignId") REFERENCES "ShaftDesign"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "CompanyLogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingCounter" ADD CONSTRAINT "DrawingCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An issued drawing set is an immutable record, as a calculation: refuse every UPDATE except the author or the logo
-- link becoming NULL when that row is deleted (ON DELETE SET NULL).
CREATE FUNCTION "drawing_set_immutable"() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'userId' - 'logoId') = (to_jsonb(OLD) - 'userId' - 'logoId')
     AND (NEW."userId" IS NOT DISTINCT FROM OLD."userId" OR NEW."userId" IS NULL)
     AND (NEW."logoId" IS NOT DISTINCT FROM OLD."logoId" OR NEW."logoId" IS NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'DrawingSet % is immutable', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DrawingSet_no_update" BEFORE UPDATE ON "DrawingSet" FOR EACH ROW EXECUTE FUNCTION "drawing_set_immutable"();

-- A logo is never changed in place: a new logo is a new row, so the sets issued with the old one keep it.
CREATE FUNCTION "company_logo_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CompanyLogo % is immutable', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CompanyLogo_no_update" BEFORE UPDATE ON "CompanyLogo" FOR EACH ROW EXECUTE FUNCTION "company_logo_immutable"();
