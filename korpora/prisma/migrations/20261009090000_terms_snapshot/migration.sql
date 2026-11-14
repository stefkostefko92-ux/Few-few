-- CreateTable
CREATE TABLE "TermsSnapshot" (
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermsSnapshot_pkey" PRIMARY KEY ("version","locale")
);
