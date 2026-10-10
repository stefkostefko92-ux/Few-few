-- AlterTable
ALTER TABLE "CaseMessage" ADD COLUMN     "audiences" "Audience"[] DEFAULT ARRAY[]::"Audience"[];
