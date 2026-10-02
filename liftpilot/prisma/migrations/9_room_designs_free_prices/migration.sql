-- Round 19: the machine room of a machine replacement as surveyed (RoomDesign), immutable like a calculation; the
-- drawing set made of the shaft design of a whole project or of the machine room of a replacement — one of the two;
-- the free lines of the company's price list (CustomPriceItem).

-- RoomDesign
CREATE TABLE "RoomDesign" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "userId" TEXT,
    "label" TEXT,
    "inputs" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "failCount" INTEGER NOT NULL,
    "warnCount" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomDesign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RoomDesign_projectId_createdAt_idx" ON "RoomDesign"("projectId", "createdAt");
CREATE INDEX "RoomDesign_companyId_idx" ON "RoomDesign"("companyId");
CREATE INDEX "RoomDesign_calculationId_idx" ON "RoomDesign"("calculationId");
CREATE INDEX "RoomDesign_userId_idx" ON "RoomDesign"("userId");
ALTER TABLE "RoomDesign" ADD CONSTRAINT "RoomDesign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomDesign" ADD CONSTRAINT "RoomDesign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomDesign" ADD CONSTRAINT "RoomDesign_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "Calculation"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "RoomDesign" ADD CONSTRAINT "RoomDesign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A room design is an immutable record, as a calculation: refuse every UPDATE except the author becoming NULL when
-- that user is deleted (ON DELETE SET NULL).
CREATE FUNCTION "room_design_immutable"() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'userId') = (to_jsonb(OLD) - 'userId')
     AND (NEW."userId" IS NOT DISTINCT FROM OLD."userId" OR NEW."userId" IS NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'RoomDesign % is immutable', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RoomDesign_no_update" BEFORE UPDATE ON "RoomDesign" FOR EACH ROW EXECUTE FUNCTION "room_design_immutable"();

-- DrawingSet: of a shaft design or of a room design, exactly one (the sets issued so far are all of a shaft design)
ALTER TABLE "DrawingSet" ALTER COLUMN "shaftDesignId" DROP NOT NULL;
ALTER TABLE "DrawingSet" ADD COLUMN "roomDesignId" TEXT;
CREATE INDEX "DrawingSet_roomDesignId_idx" ON "DrawingSet"("roomDesignId");
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_roomDesignId_fkey" FOREIGN KEY ("roomDesignId") REFERENCES "RoomDesign"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_one_design_check" CHECK (("shaftDesignId" IS NULL) <> ("roomDesignId" IS NULL));

-- Free lines of the price list
CREATE TYPE "PriceBasis" AS ENUM ('LOT', 'STOP', 'TRAVEL');
CREATE TYPE "PriceScope" AS ENUM ('ALL', 'FULL', 'REPLACEMENT');
CREATE TABLE "CustomPriceItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "basis" "PriceBasis" NOT NULL DEFAULT 'LOT',
    "scope" "PriceScope" NOT NULL DEFAULT 'ALL',
    "position" INTEGER NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomPriceItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomPriceItem_cents_check" CHECK ("cents" >= 0)
);
CREATE INDEX "CustomPriceItem_companyId_position_idx" ON "CustomPriceItem"("companyId", "position");
ALTER TABLE "CustomPriceItem" ADD CONSTRAINT "CustomPriceItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
