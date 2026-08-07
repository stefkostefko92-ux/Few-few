-- v35 — Server Event Logging: нова категория "messages" (редакция/изтриване
-- на съобщения). Дефолтът за НОВИ сървъри я включва; съществуващите пазят
-- избраните си категории и я включват от Settings → Server Event Logging.

ALTER TABLE "servers" ALTER COLUMN "eventLogCategories"
    SET DEFAULT ARRAY['voice', 'members', 'moderation', 'messages']::TEXT[];
