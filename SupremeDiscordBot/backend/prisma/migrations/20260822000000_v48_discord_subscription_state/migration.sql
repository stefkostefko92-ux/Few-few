-- v48 — Discord Premium Apps: състояние на абонамента (SUBSCRIPTION_CREATE/UPDATE/DELETE).
--
-- Плащанията са Discord-first (решение на собственика, 12.09.2026). Entitlement-ът
-- остава ЕДИНСТВЕНИЯТ източник на права (discordEntitlementId/discordSkuId, v27);
-- тук записваме само „защо“ и „докога“, за да може таблото и /premium status да
-- покажат „подновява се на …“ / „изтича на …“ без втора заявка към Discord.
--
-- Промяната е АДИТИВНА: три nullable колони, нищо съществуващо не се пипа.
-- Колоните на "servers" са camelCase (виж v47 — snake_case би гръмнал на живо).
--
-- Trial колоните (trialUsed/trialStartedAt/trialEndsAt) НЕ се дропват тук: заварени
-- пробни периоди изтичат сами до 14 дни след деплой; дропът е отделна миграция.

ALTER TABLE "servers" ADD COLUMN "discordSubscriptionId" TEXT;
ALTER TABLE "servers" ADD COLUMN "discordSubscriptionStatus" INTEGER;
ALTER TABLE "servers" ADD COLUMN "discordCurrentPeriodEnd" TIMESTAMP(3);
