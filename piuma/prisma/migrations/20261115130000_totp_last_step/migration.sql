-- Последната използвана TOTP стъпка (брояч по RFC 6238): един код = едно ползване (ASVS 5.0 v6.5.1).
-- Адитивно: nullable колона, старите редове започват с NULL (първият код след деплоя минава).
ALTER TABLE "User" ADD COLUMN "totpLastStep" INTEGER;
