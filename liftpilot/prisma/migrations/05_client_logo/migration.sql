-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "clientLogoId" TEXT;

-- AlterTable
ALTER TABLE "DrawingSet" ADD COLUMN     "clientLogoId" TEXT;

-- CreateTable
CREATE TABLE "ClientLogo" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientLogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientLogo_projectId_createdAt_idx" ON "ClientLogo"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientLogo_companyId_idx" ON "ClientLogo"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_clientLogoId_key" ON "Project"("clientLogoId");

-- CreateIndex
CREATE INDEX "DrawingSet_clientLogoId_idx" ON "DrawingSet"("clientLogoId");

-- AddForeignKey
ALTER TABLE "ClientLogo" ADD CONSTRAINT "ClientLogo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientLogo" ADD CONSTRAINT "ClientLogo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientLogoId_fkey" FOREIGN KEY ("clientLogoId") REFERENCES "ClientLogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_clientLogoId_fkey" FOREIGN KEY ("clientLogoId") REFERENCES "ClientLogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A client's logo is never changed in place: a new logo is a new row, so the sets issued with the old one keep it.
CREATE FUNCTION "client_logo_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ClientLogo % is immutable', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClientLogo_no_update" BEFORE UPDATE ON "ClientLogo" FOR EACH ROW EXECUTE FUNCTION "client_logo_immutable"();

-- An issued drawing set stays immutable: besides the author and the company's logo, the client's logo link may only
-- become NULL when that row is deleted (ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION "drawing_set_immutable"() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'userId' - 'logoId' - 'clientLogoId') = (to_jsonb(OLD) - 'userId' - 'logoId' - 'clientLogoId')
     AND (NEW."userId" IS NOT DISTINCT FROM OLD."userId" OR NEW."userId" IS NULL)
     AND (NEW."logoId" IS NOT DISTINCT FROM OLD."logoId" OR NEW."logoId" IS NULL)
     AND (NEW."clientLogoId" IS NOT DISTINCT FROM OLD."clientLogoId" OR NEW."clientLogoId" IS NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'DrawingSet % is immutable', OLD."id";
END;
$$ LANGUAGE plpgsql;
