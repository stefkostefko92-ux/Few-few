-- Round 49: the relazione tecnica di modifica (one report for every modification of an existing lift — «Solo argano» and
-- «Ammodernamento», on the machine room path and on the shaft path). Written over `prisma migrate diff`. Additive only:
-- no existing row changes (Project gains one NULL column), so the previous code reads the database after it too:
--   * Project."anagrafica": the plant registry (owner, maintainer, construction number, year, approval law, the
--     documented «before» persons, stops and car area; src/lib/rt/anagrafica.ts) — a JSON object or SQL NULL, never a
--     JSON null (CHECK);
--   * "Attachment" + "AttachmentBlob": the files uploaded for an installation (PDF, JPEG, PNG; metadata in the first, the
--     bytes in the second, so a list never loads them). Title, kind and component may change, nothing else (trigger
--     "attachment_guard"; the author may become NULL when the user is deleted); the bytes never change;
--   * "TechnicalReport" (+ "TechnicalReportCounter"): the issued reports, numbered YY-NNN per company and year, a revision
--     being a new row with the same number — immutable like "DrawingSet" (02_drawing_sets), made from a room design or a
--     lift design, exactly one of the two (CHECK);
--   * "TechnicalReportAttachment": the files of an issued report in their order, as they were at issue — never changed;
--     a file in use cannot be deleted (foreign key NO ACTION, DEFERRABLE INITIALLY DEFERRED: checked at the commit,
--     so deleting the installation or the company still removes both sides — the rows hang from the report, a level
--     below the file, and a check at the end of the statement could run before the report's cascade);
--   * "TechnicalReportPdf": the body of an issued report as first rendered, kept like "DrawingSetPdf" (11_drawing_set_pdf).
-- Needs 26_rilievi_sync_2 before it (never applied without it). Backup and a trial on a copy first; `prisma migrate
-- deploy` only.
--
-- Rollback (take a backup first — the uploaded files and the issued reports are lost with their tables):
--   DROP TRIGGER "TechnicalReportPdf_no_update" ON "TechnicalReportPdf";
--   DROP TRIGGER "TechnicalReportAttachment_no_update" ON "TechnicalReportAttachment";
--   DROP TRIGGER "TechnicalReport_no_update" ON "TechnicalReport";
--   DROP TRIGGER "AttachmentBlob_no_update" ON "AttachmentBlob";
--   DROP TRIGGER "Attachment_guard" ON "Attachment";
--   DROP FUNCTION "technical_report_pdf_immutable"(), "technical_report_attachment_immutable"(),
--     "technical_report_immutable"(), "attachment_blob_immutable"(), "attachment_guard"();
--   DROP TABLE "TechnicalReportPdf", "TechnicalReportAttachment", "TechnicalReport", "TechnicalReportCounter",
--     "AttachmentBlob", "Attachment";
--   DROP TYPE "AttachmentKind";
--   ALTER TABLE "Project" DROP CONSTRAINT "Project_anagrafica_object_check", DROP COLUMN "anagrafica";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '27_relazione_modifica';

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('DICHIARAZIONE_UE', 'CERTIFICATO_ESAME_TIPO', 'CERTIFICATO_COMPONENTE', 'SCHEMA_ELETTRICO', 'DICHIARAZIONE_IDONEITA', 'RELAZIONE_TARATURA', 'LIBRETTO_VERBALE', 'DISEGNO', 'FOTO', 'ALTRO');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "anagrafica" JSONB;

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "component" TEXT,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "orientation" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentBlob" (
    "attachmentId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "AttachmentBlob_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateTable
CREATE TABLE "TechnicalReportCounter" (
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TechnicalReportCounter_pkey" PRIMARY KEY ("companyId","year")
);

-- CreateTable
CREATE TABLE "TechnicalReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "revisions" JSONB NOT NULL,
    "calculationId" TEXT NOT NULL,
    "roomDesignId" TEXT,
    "liftDesignId" TEXT,
    "inputs" JSONB NOT NULL,
    "anagrafica" JSONB NOT NULL,
    "projectData" JSONB NOT NULL,
    "plant" JSONB NOT NULL,
    "companyName" TEXT NOT NULL,
    "logoId" TEXT,
    "results" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "failCount" INTEGER NOT NULL,
    "warnCount" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicalReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalReportAttachment" (
    "reportId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "component" TEXT,
    "sha256" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,

    CONSTRAINT "TechnicalReportAttachment_pkey" PRIMARY KEY ("reportId","position")
);

-- CreateTable
CREATE TABLE "TechnicalReportPdf" (
    "reportId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicalReportPdf_pkey" PRIMARY KEY ("reportId")
);

-- CreateIndex
CREATE INDEX "Attachment_companyId_idx" ON "Attachment"("companyId");
CREATE INDEX "Attachment_projectId_createdAt_idx" ON "Attachment"("projectId", "createdAt");
CREATE INDEX "Attachment_createdById_idx" ON "Attachment"("createdById");
CREATE UNIQUE INDEX "Attachment_projectId_sha256_key" ON "Attachment"("projectId", "sha256");
CREATE INDEX "TechnicalReport_projectId_createdAt_idx" ON "TechnicalReport"("projectId", "createdAt");
CREATE INDEX "TechnicalReport_calculationId_idx" ON "TechnicalReport"("calculationId");
CREATE INDEX "TechnicalReport_roomDesignId_idx" ON "TechnicalReport"("roomDesignId");
CREATE INDEX "TechnicalReport_liftDesignId_idx" ON "TechnicalReport"("liftDesignId");
CREATE INDEX "TechnicalReport_userId_idx" ON "TechnicalReport"("userId");
CREATE INDEX "TechnicalReport_logoId_idx" ON "TechnicalReport"("logoId");
CREATE UNIQUE INDEX "TechnicalReport_companyId_year_seq_revision_key" ON "TechnicalReport"("companyId", "year", "seq", "revision");
CREATE INDEX "TechnicalReportAttachment_attachmentId_idx" ON "TechnicalReportAttachment"("attachmentId");
CREATE UNIQUE INDEX "TechnicalReportAttachment_reportId_attachmentId_key" ON "TechnicalReportAttachment"("reportId", "attachmentId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttachmentBlob" ADD CONSTRAINT "AttachmentBlob_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TechnicalReportCounter" ADD CONSTRAINT "TechnicalReportCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "Calculation"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_roomDesignId_fkey" FOREIGN KEY ("roomDesignId") REFERENCES "RoomDesign"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_liftDesignId_fkey" FOREIGN KEY ("liftDesignId") REFERENCES "LiftDesign"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "CompanyLogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TechnicalReportAttachment" ADD CONSTRAINT "TechnicalReportAttachment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "TechnicalReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- deferred to the commit (Prisma does not model it, `migrate diff` ignores it): the file of an issued report cannot be
-- deleted, while deleting the installation or the company removes the reports, their rows and the files in whatever
-- order the cascades run (a check at the end of the statement would fire before the report's rows are gone)
ALTER TABLE "TechnicalReportAttachment" ADD CONSTRAINT "TechnicalReportAttachment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "TechnicalReportPdf" ADD CONSTRAINT "TechnicalReportPdf_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "TechnicalReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The registry is a JSON object or SQL NULL (never a JSON null: clear it with Prisma.DbNull).
ALTER TABLE "Project" ADD CONSTRAINT "Project_anagrafica_object_check"
  CHECK ("anagrafica" IS NULL OR jsonb_typeof("anagrafica") = 'object');

-- An uploaded file: one of the three types recognised by its bytes, at most 20 MiB, at most 200 pages, its SHA-256 in
-- lower-case hex, an EXIF orientation 1..8 when known, a title and a file name of bounded length.
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_mime_check" CHECK ("mime" IN ('application/pdf', 'image/jpeg', 'image/png'));
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_size_check" CHECK ("size" BETWEEN 1 AND 20971520);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_pages_check" CHECK ("pages" BETWEEN 1 AND 200);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_orientation_check" CHECK ("orientation" IS NULL OR "orientation" BETWEEN 1 AND 8);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_title_check" CHECK (char_length("title") BETWEEN 1 AND 160);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_fileName_check" CHECK (char_length("fileName") BETWEEN 1 AND 120);
ALTER TABLE "AttachmentBlob" ADD CONSTRAINT "AttachmentBlob_data_check" CHECK (octet_length("data") > 0);

-- An issued report: made from a room design or from a lift design, exactly one; revision 0 or more; its hash in hex.
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_one_base_check" CHECK (("roomDesignId" IS NULL) <> ("liftDesignId" IS NULL));
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_revision_check" CHECK ("revision" >= 0);
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- The files of an issued report: «Allegato 1» to «Allegato 40», as the file was (hash in hex, its pages).
ALTER TABLE "TechnicalReportAttachment" ADD CONSTRAINT "TechnicalReportAttachment_position_check" CHECK ("position" BETWEEN 1 AND 40);
ALTER TABLE "TechnicalReportAttachment" ADD CONSTRAINT "TechnicalReportAttachment_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "TechnicalReportAttachment" ADD CONSTRAINT "TechnicalReportAttachment_pages_check" CHECK ("pages" BETWEEN 1 AND 200);

-- The body kept: not empty, at least one page, its hash in hex.
ALTER TABLE "TechnicalReportPdf" ADD CONSTRAINT "TechnicalReportPdf_data_check" CHECK (octet_length("data") > 0);
ALTER TABLE "TechnicalReportPdf" ADD CONSTRAINT "TechnicalReportPdf_pages_check" CHECK ("pages" >= 1);
ALTER TABLE "TechnicalReportPdf" ADD CONSTRAINT "TechnicalReportPdf_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- An uploaded file: only its title, kind and component may change; its author may become NULL when that user is
-- deleted (ON DELETE SET NULL). Everything else — the project, the type, the size, the hash, the pages — never does.
CREATE FUNCTION "attachment_guard"() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'title' - 'kind' - 'component' - 'createdById') = (to_jsonb(OLD) - 'title' - 'kind' - 'component' - 'createdById')
     AND (NEW."createdById" IS NOT DISTINCT FROM OLD."createdById" OR NEW."createdById" IS NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Attachment %: only the title, the kind and the component may change', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Attachment_guard" BEFORE UPDATE ON "Attachment" FOR EACH ROW EXECUTE FUNCTION "attachment_guard"();

-- The bytes of an uploaded file are never changed in place.
CREATE FUNCTION "attachment_blob_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AttachmentBlob % is immutable', OLD."attachmentId";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AttachmentBlob_no_update" BEFORE UPDATE ON "AttachmentBlob" FOR EACH ROW EXECUTE FUNCTION "attachment_blob_immutable"();

-- An issued report is an immutable record, as a drawing set: refuse every UPDATE except the author or the logo link
-- becoming NULL when that row is deleted (ON DELETE SET NULL).
CREATE FUNCTION "technical_report_immutable"() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'userId' - 'logoId') = (to_jsonb(OLD) - 'userId' - 'logoId')
     AND (NEW."userId" IS NOT DISTINCT FROM OLD."userId" OR NEW."userId" IS NULL)
     AND (NEW."logoId" IS NOT DISTINCT FROM OLD."logoId" OR NEW."logoId" IS NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'TechnicalReport % is immutable', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TechnicalReport_no_update" BEFORE UPDATE ON "TechnicalReport" FOR EACH ROW EXECUTE FUNCTION "technical_report_immutable"();

-- The files of an issued report are its snapshot: never changed.
CREATE FUNCTION "technical_report_attachment_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'TechnicalReportAttachment %/% is immutable', OLD."reportId", OLD."position";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TechnicalReportAttachment_no_update" BEFORE UPDATE ON "TechnicalReportAttachment" FOR EACH ROW EXECUTE FUNCTION "technical_report_attachment_immutable"();

-- The body kept is never changed in place.
CREATE FUNCTION "technical_report_pdf_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'TechnicalReportPdf % is immutable', OLD."reportId";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TechnicalReportPdf_no_update" BEFORE UPDATE ON "TechnicalReportPdf" FOR EACH ROW EXECUTE FUNCTION "technical_report_pdf_immutable"();
