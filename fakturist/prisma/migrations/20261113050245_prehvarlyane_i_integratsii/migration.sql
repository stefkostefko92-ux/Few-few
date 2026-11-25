-- CreateTable
CREATE TABLE "Integration" (
    "code" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "secretsEnc" TEXT,
    "secretHints" JSONB,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "lastCheckError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "TransferInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TransferInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Integration_updatedById_idx" ON "Integration"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "TransferInvite_tokenHash_key" ON "TransferInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "TransferInvite_organizationId_idx" ON "TransferInvite"("organizationId");

-- CreateIndex
CREATE INDEX "TransferInvite_createdById_idx" ON "TransferInvite"("createdById");

-- CreateIndex
CREATE INDEX "TransferInvite_acceptedById_idx" ON "TransferInvite"("acceptedById");

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferInvite" ADD CONSTRAINT "TransferInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferInvite" ADD CONSTRAINT "TransferInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferInvite" ADD CONSTRAINT "TransferInvite_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
