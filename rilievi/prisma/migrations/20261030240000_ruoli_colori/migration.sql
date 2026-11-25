-- Имената и правата на ролите по фирма и цветовете на всеки човек (тема „Personalizzato“) — собственикът,
-- 30 октомври 2026. Само добавя: две колони на фирмата, една на човека и стойност на enum-а Theme.

-- AlterEnum
ALTER TYPE "Theme" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "Azienda" ADD COLUMN     "nomiRuoli" JSONB,
ADD COLUMN     "permessiRuoli" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "colori" JSONB;
