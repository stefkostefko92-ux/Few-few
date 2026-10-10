-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('PASSWORD', 'SSO');

-- CreateEnum
CREATE TYPE "SsoProvider" AS ENUM ('ENTRA', 'OIDC');

-- CreateEnum
CREATE TYPE "SsoMode" AS ENUM ('OPTIONAL', 'REQUIRED');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "authMethod" "AuthMethod" NOT NULL DEFAULT 'PASSWORD',
ADD COLUMN     "mfaViaIdp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ssoConfigId" TEXT;

-- CreateTable
CREATE TABLE "SsoConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "provider" "SsoProvider" NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "issuer" TEXT NOT NULL,
    "entraTenantId" TEXT,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "secretUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" "SsoMode" NOT NULL DEFAULT 'OPTIONAL',
    "trustIdpMfa" BOOLEAN NOT NULL DEFAULT false,
    "idpLogout" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "externalSubject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoLoginState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "bindingHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "SsoLoginState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SsoConfig_companyId_idx" ON "SsoConfig"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SsoConfig_tenantId_scopeKey_key" ON "SsoConfig"("tenantId", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "SsoDomain_domain_key" ON "SsoDomain"("domain");

-- CreateIndex
CREATE INDEX "SsoDomain_tenantId_idx" ON "SsoDomain"("tenantId");

-- CreateIndex
CREATE INDEX "SsoDomain_configId_idx" ON "SsoDomain"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_userId_key" ON "ExternalIdentity"("userId");

-- CreateIndex
CREATE INDEX "ExternalIdentity_tenantId_idx" ON "ExternalIdentity"("tenantId");

-- CreateIndex
CREATE INDEX "ExternalIdentity_configId_idx" ON "ExternalIdentity"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_issuer_externalSubject_key" ON "ExternalIdentity"("issuer", "externalSubject");

-- CreateIndex
CREATE UNIQUE INDEX "SsoLoginState_stateHash_key" ON "SsoLoginState"("stateHash");

-- CreateIndex
CREATE INDEX "SsoLoginState_tenantId_idx" ON "SsoLoginState"("tenantId");

-- CreateIndex
CREATE INDEX "SsoLoginState_configId_idx" ON "SsoLoginState"("configId");

-- CreateIndex
CREATE INDEX "SsoLoginState_expiresAt_idx" ON "SsoLoginState"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_ssoConfigId_idx" ON "Session"("ssoConfigId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_ssoConfigId_fkey" FOREIGN KEY ("ssoConfigId") REFERENCES "SsoConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoConfig" ADD CONSTRAINT "SsoConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoConfig" ADD CONSTRAINT "SsoConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoDomain" ADD CONSTRAINT "SsoDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoDomain" ADD CONSTRAINT "SsoDomain_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SsoConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SsoConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoLoginState" ADD CONSTRAINT "SsoLoginState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoLoginState" ADD CONSTRAINT "SsoLoginState_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SsoConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

