-- CreateTable
CREATE TABLE "VisitDay" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitDay_day_idx" ON "VisitDay"("day");

-- CreateIndex
CREATE UNIQUE INDEX "VisitDay_day_ipHash_key" ON "VisitDay"("day", "ipHash");
