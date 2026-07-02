-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('HEALTH', 'ADMIN', 'UTILITY', 'TRANSPORT', 'SOCIAL', 'EMERGENCY', 'EDUCATION', 'OTHER');

-- CreateEnum
CREATE TYPE "BusinessCategory" AS ENUM ('SHOP', 'FOOD', 'SERVICE', 'CRAFT', 'AGRO', 'TOURISM', 'HEALTH', 'OTHER');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('OFFER', 'WANTED', 'JOB', 'REALESTATE', 'FREE', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('NEW', 'FORWARDED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HelpKind" AS ENUM ('NEED', 'OFFER');

-- CreateEnum
CREATE TYPE "RideKind" AS ENUM ('OFFER', 'NEED');

-- CreateEnum
CREATE TYPE "DumpStatus" AS ENUM ('NEW', 'CONFIRMED', 'FORWARDED', 'CLEANED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'PAID', 'ACTIVE', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EDITOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Общи',
    "tags" TEXT NOT NULL DEFAULT '',
    "steps" TEXT NOT NULL DEFAULT '',
    "relatedLinks" TEXT NOT NULL DEFAULT '',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "phone2" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "hours" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "BusinessCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "facebook" TEXT NOT NULL DEFAULT '',
    "hours" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "organizer" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "ListingType" NOT NULL DEFAULT 'OFFER',
    "category" TEXT NOT NULL DEFAULT 'Общи',
    "price" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "coverImage" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "sourceDate" TIMESTAMP(3),
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "refCode" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Общи',
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "status" "ComplaintStatus" NOT NULL DEFAULT 'NEW',
    "forwardedTo" TEXT NOT NULL DEFAULT '',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Volunteer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT '',
    "skills" TEXT NOT NULL DEFAULT '',
    "about" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Volunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rideshare" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "RideKind" NOT NULL DEFAULT 'OFFER',
    "routeFrom" TEXT NOT NULL,
    "routeTo" TEXT NOT NULL,
    "schedule" TEXT NOT NULL DEFAULT '',
    "seats" TEXT NOT NULL DEFAULT '',
    "costNote" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rideshare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpCause" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "HelpKind" NOT NULL DEFAULT 'NEED',
    "beneficiary" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpCause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "GalleryPhoto" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "submitterContact" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DumpReport" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "reporterName" TEXT NOT NULL DEFAULT '',
    "reporterPhone" TEXT NOT NULL DEFAULT '',
    "reporterEmail" TEXT NOT NULL DEFAULT '',
    "status" "DumpStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DumpReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdRequest" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "status" "AdRequestStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sponsor" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "linkUrl" TEXT NOT NULL DEFAULT '',
    "bgColor" TEXT NOT NULL DEFAULT '',
    "accentColor" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchMiss" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchMiss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScamAlert" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScamAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "utility" TEXT NOT NULL DEFAULT 'ELECTRICITY',
    "area" TEXT NOT NULL DEFAULT '',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "planned" BOOLEAN NOT NULL DEFAULT true,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Faq_slug_key" ON "Faq"("slug");

-- CreateIndex
CREATE INDEX "Faq_published_category_idx" ON "Faq"("published", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE INDEX "Service_published_category_idx" ON "Service"("published", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE INDEX "Business_published_category_idx" ON "Business"("published", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_published_startAt_idx" ON "Event"("published", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_slug_key" ON "Listing"("slug");

-- CreateIndex
CREATE INDEX "Listing_published_type_idx" ON "Listing"("published", "type");

-- CreateIndex
CREATE INDEX "Listing_expiresAt_idx" ON "Listing"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "Post_published_publishedAt_idx" ON "Post"("published", "publishedAt");

-- CreateIndex
CREATE INDEX "Post_sourceUrl_idx" ON "Post"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_refCode_key" ON "Complaint"("refCode");

-- CreateIndex
CREATE INDEX "Complaint_status_createdAt_idx" ON "Complaint"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Volunteer_slug_key" ON "Volunteer"("slug");

-- CreateIndex
CREATE INDEX "Volunteer_published_createdAt_idx" ON "Volunteer"("published", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rideshare_slug_key" ON "Rideshare"("slug");

-- CreateIndex
CREATE INDEX "Rideshare_published_kind_idx" ON "Rideshare"("published", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "HelpCause_slug_key" ON "HelpCause"("slug");

-- CreateIndex
CREATE INDEX "HelpCause_published_kind_idx" ON "HelpCause"("published", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Memory_slug_key" ON "Memory"("slug");

-- CreateIndex
CREATE INDEX "Memory_published_createdAt_idx" ON "Memory"("published", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryPhoto_slug_key" ON "GalleryPhoto"("slug");

-- CreateIndex
CREATE INDEX "GalleryPhoto_published_order_idx" ON "GalleryPhoto"("published", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DumpReport_slug_key" ON "DumpReport"("slug");

-- CreateIndex
CREATE INDEX "DumpReport_published_status_idx" ON "DumpReport"("published", "status");

-- CreateIndex
CREATE INDEX "AdRequest_status_createdAt_idx" ON "AdRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Banner_published_order_idx" ON "Banner"("published", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ScamAlert_slug_key" ON "ScamAlert"("slug");

-- CreateIndex
CREATE INDEX "ScamAlert_published_order_idx" ON "ScamAlert"("published", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Outage_slug_key" ON "Outage"("slug");

-- CreateIndex
CREATE INDEX "Outage_published_startAt_idx" ON "Outage"("published", "startAt");

-- CreateIndex
CREATE INDEX "ContactMessage_handled_createdAt_idx" ON "ContactMessage"("handled", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

