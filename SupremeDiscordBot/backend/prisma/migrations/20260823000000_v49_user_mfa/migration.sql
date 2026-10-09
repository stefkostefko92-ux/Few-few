-- v49 — втори фактор (TOTP) за акаунтите в таблото; задължителен за staff ролите
-- (MAIN_OWNER / SUPER_USER / SUPPORT_STAFF) преди достъп до /api/admin.
--
-- АДИТИВНА: четири nullable колони в "users" (camelCase — виж v47/v48).
--   mfaSecret       — TOTP тайна, шифрирана с AES-256-GCM (lib/crypto.js)
--   mfaEnabledAt    — кога е записан вторият фактор (null = няма)
--   mfaBackupCodes  — JSON масив от SHA-256 хешове на еднократни резервни кодове
--   mfaLastUsedStep — последната приета 30-секундна стъпка (един код важи веднъж)

ALTER TABLE "users" ADD COLUMN "mfaSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "mfaEnabledAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "mfaBackupCodes" TEXT;
ALTER TABLE "users" ADD COLUMN "mfaLastUsedStep" INTEGER;
