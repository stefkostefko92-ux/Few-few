-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Registry" AS ENUM ('KZP', 'RPO');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('email', 'phone', 'form', 'linkedin');

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecretEnc" TEXT NOT NULL,
    "totpLastStep" INTEGER,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryResult" (
    "id" TEXT NOT NULL,
    "registry" "Registry" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "listed" BOOLEAN NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistryResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrySnapshot" (
    "id" TEXT NOT NULL,
    "registry" "Registry" NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "RegistrySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrySnapshotEntry" (
    "snapshotId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "RegistrySnapshotEntry_pkey" PRIMARY KEY ("snapshotId","fingerprint")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "fingerprint" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("fingerprint")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "method" TEXT NOT NULL,
    "wording" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");

-- CreateIndex
CREATE INDEX "RegistryResult_registry_fingerprint_checkedAt_idx" ON "RegistryResult"("registry", "fingerprint", "checkedAt");

-- CreateIndex
CREATE INDEX "RegistrySnapshot_registry_takenAt_idx" ON "RegistrySnapshot"("registry", "takenAt");

-- CreateIndex
CREATE INDEX "RegistrySnapshotEntry_fingerprint_idx" ON "RegistrySnapshotEntry"("fingerprint");

-- CreateIndex
CREATE INDEX "Consent_fingerprint_channel_idx" ON "Consent"("fingerprint", "channel");

-- AddForeignKey
ALTER TABLE "RegistrySnapshotEntry" ADD CONSTRAINT "RegistrySnapshotEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RegistrySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

