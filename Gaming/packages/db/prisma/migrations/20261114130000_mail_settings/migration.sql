-- Пощата на портала (Brevo SMTP), настроена от собственика в админ панела.
-- Един ред; ключът е шифрован; портовете на Brevo; нищо празно. Само добавя.
CREATE TABLE "MailSettings" (
    "id" VARCHAR(10) NOT NULL DEFAULT 'mail',
    "host" VARCHAR(253) NOT NULL,
    "port" INTEGER NOT NULL,
    "username" VARCHAR(254) NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "fromName" VARCHAR(80) NOT NULL,
    "fromEmail" VARCHAR(254) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "MailSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MailSettings_check" CHECK (
      "id" = 'mail'
      AND "port" IN (465, 587, 2525)
      AND length(btrim("host")) > 0
      AND length(btrim("username")) > 0
      AND length("passwordEnc") > 0
      AND length(btrim("fromName")) > 0
      AND length(btrim("fromEmail")) > 0
    )
);
