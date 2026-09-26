-- Защита на достъпа след червения екип (25.09.2026).
--
-- 1. `users.totpUltimoPasso` — последната приета стъпка на TOTP. Без нея един
--    и същ код върши работа до 90 s (прозорецът ±1): подслушан или надникнат
--    код влиза втори път.
-- 2. `sessioni_attive.tokenPrecedenteHash` + `ruotataAt` — откриване на
--    ПОВТОРНА употреба на refresh token. Законният клиент вече държи новия;
--    ако старият пристигне отново, той е у някой друг и сесията се отменя.
--
-- Адитивно: нови nullable колони, нищо не се трие и не се пренаписва.

ALTER TABLE "users" ADD COLUMN "totpUltimoPasso" INTEGER;

ALTER TABLE "sessioni_attive" ADD COLUMN "tokenPrecedenteHash" TEXT;
ALTER TABLE "sessioni_attive" ADD COLUMN "ruotataAt" TIMESTAMP(3);

CREATE INDEX "sessioni_attive_tokenPrecedenteHash_idx" ON "sessioni_attive"("tokenPrecedenteHash");
