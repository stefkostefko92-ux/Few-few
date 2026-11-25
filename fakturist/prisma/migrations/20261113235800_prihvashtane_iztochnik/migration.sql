-- Абонаментът, от който е прихванатото: при активиране трябва още да е действащият (без второ
-- прихващане на същото време). Само добавя; IF NOT EXISTS — тестовите бази с ранна чернова.
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "creditSubscriptionId" TEXT;
