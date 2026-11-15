-- SAF-T (данни за продажбите): сметките на фирмата от сметкоплана и свързаните лица — адитивно, със стойности по подразбиране.
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "saftReceivableAccount" TEXT NOT NULL DEFAULT '411',
ADD COLUMN     "saftRelatedParties" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "saftRevenueAccount" TEXT NOT NULL DEFAULT '703';

