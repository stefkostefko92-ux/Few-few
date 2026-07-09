-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER,
    "timesRedeemed" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Coupon_profileId_idx" ON "Coupon"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_profileId_code_key" ON "Coupon"("profileId", "code");

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "couponCode" TEXT;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
