-- Round 21: the PDF of an issued drawing set, kept as it was issued — rendered once, right after the issue or at the
-- first download while the running engines still reproduce the set —, so that an issued set stays downloadable after
-- an engine's change. Immutable, as the set.

-- DrawingSetPdf
CREATE TABLE "DrawingSetPdf" (
    "drawingSetId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingSetPdf_pkey" PRIMARY KEY ("drawingSetId")
);
ALTER TABLE "DrawingSetPdf" ADD CONSTRAINT "DrawingSetPdf_drawingSetId_fkey" FOREIGN KEY ("drawingSetId") REFERENCES "DrawingSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- the PDF kept is never changed in place
CREATE FUNCTION "drawing_set_pdf_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'DrawingSetPdf % is immutable', OLD."drawingSetId";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DrawingSetPdf_no_update" BEFORE UPDATE ON "DrawingSetPdf" FOR EACH ROW EXECUTE FUNCTION "drawing_set_pdf_immutable"();
