-- Одит 2026-10-09 (Кодаджията H1 + Правния Б1): изтриването на продукт/акаунт
-- не бива да трие покупките (OSS/Н-18 записи, 10 г.) и платения достъп.
-- Restrict вместо Cascade; приложението архивира продукта (active=false) или
-- анонимизира акаунта вместо да го изтрива, когато има покупки.
ALTER TABLE "Purchase" DROP CONSTRAINT "Purchase_productId_fkey";
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Entitlement" DROP CONSTRAINT "Entitlement_productId_fkey";
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Дашбордът чете профилите по userId при всяко зареждане (одит L9).
CREATE INDEX "Profile_userId_idx" ON "Profile"("userId");
