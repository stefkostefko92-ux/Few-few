-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_code_key" ON "ShortLink"("code");

-- CreateIndex
CREATE INDEX "ShortLink_profileId_createdAt_idx" ON "ShortLink"("profileId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
