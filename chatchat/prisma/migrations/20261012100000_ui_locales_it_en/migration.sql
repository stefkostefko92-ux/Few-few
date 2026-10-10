-- Интерфейсът на ChatChat е само на италиански и английски (решение на собственика): езикът на
-- профила (интерфейс, писма, AI отговори) и езикът на текстовете към helpdesk-а — bg → it.
-- Бързите отговори на български остават за историята (не се показват — няма такъв език в профила).
UPDATE "User" SET "locale" = 'it' WHERE "locale" NOT IN ('it', 'en');

UPDATE "HelpdeskIntegration"
SET "settings" = jsonb_set("settings", '{language}', '"it"')
WHERE "settings" ? 'language' AND "settings"->>'language' NOT IN ('it', 'en');
