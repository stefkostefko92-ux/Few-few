-- Round 30: a new version of the terms binds a company only after its owner was told by e-mail (src/lib/legal.ts), and
-- a company inactive without a subscription is deleted after a notice to its owner (src/lib/inactive.ts).
ALTER TABLE "User" ADD COLUMN "termsNoticeVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "termsNoticeAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "inactiveNoticeAt" TIMESTAMP(3);
