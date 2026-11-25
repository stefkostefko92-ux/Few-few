-- Откъде е дошла регистрацията (SPEC 93): етикетът на кампанията — само добавя колони.
ALTER TABLE "Organization" ADD COLUMN "signupSource" TEXT;
ALTER TABLE "Organization" ADD COLUMN "signupMedium" TEXT;
ALTER TABLE "Organization" ADD COLUMN "signupCampaign" TEXT;
ALTER TABLE "Organization" ADD COLUMN "signupContent" TEXT;
ALTER TABLE "Organization" ADD COLUMN "signupTerm" TEXT;
