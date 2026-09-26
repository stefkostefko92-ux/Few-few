-- User: версия на сесиите (§14). Влиза в refresh JWT; увеличава се при нулиране
-- на парола и при изтриване на акаунт, за да обезсили refresh токените на
-- всички други устройства. Стари токени без версия се четат като 0.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
