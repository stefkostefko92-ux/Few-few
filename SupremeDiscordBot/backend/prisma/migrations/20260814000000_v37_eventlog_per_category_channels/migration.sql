-- v37 — по избор отделен лог канал за всяка категория събития.
-- Адитивна и NULL-able: заварените сървъри продължават да ползват общия
-- eventLogChannelId, докато собственикът не зададе канал за дадена категория.
ALTER TABLE "servers" ADD COLUMN "eventLogChannels" JSONB;
