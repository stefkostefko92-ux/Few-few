-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('DIGITAL', 'COURSE', 'MEMBERSHIP');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "type" "ProductType" NOT NULL DEFAULT 'DIGITAL';
ALTER TABLE "Product" ADD COLUMN "interval" TEXT;
ALTER TABLE "Product" ALTER COLUMN "deliveryUrl" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "videoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stripeSubscriptionId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lesson_productId_position_idx" ON "Lesson"("productId", "position");
CREATE UNIQUE INDEX "Entitlement_stripeSubscriptionId_key" ON "Entitlement"("stripeSubscriptionId");
CREATE INDEX "Entitlement_email_idx" ON "Entitlement"("email");
CREATE INDEX "Entitlement_profileId_idx" ON "Entitlement"("profileId");
CREATE UNIQUE INDEX "Entitlement_productId_email_key" ON "Entitlement"("productId", "email");
CREATE UNIQUE INDEX "BuyerToken_token_key" ON "BuyerToken"("token");
CREATE INDEX "BuyerToken_email_idx" ON "BuyerToken"("email");
CREATE UNIQUE INDEX "BuyerSession_tokenHash_key" ON "BuyerSession"("tokenHash");
CREATE INDEX "BuyerSession_email_idx" ON "BuyerSession"("email");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
