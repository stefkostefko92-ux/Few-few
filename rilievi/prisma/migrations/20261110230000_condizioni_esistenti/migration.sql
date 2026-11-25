-- Фирмите и хората, които съществуват към тази миграция, са тестови на собственика (собственикът, 10 ноември
-- 2026 — „Per le società già presenti oggi nel software fai risultare come se avessero firmato, siamo in fase di
-- test e tutte le società create al momento le ho create io“): броят се за приели версия 2026-11-10 на условията
-- и на правилата, за да влизат без страницата за приемане. В регистъра на приеманията („Accettazione“) НЕ се
-- пише нищо: подпис с код не е имало и не се измисля — регистърът е доказателство (чл. 19 от условията).
-- Тестова фирма, която стане истински клиент: „condizioniVersione“ = NULL за нея (DEPLOY.md) — ADMIN подписва.
UPDATE "Azienda" SET "condizioniVersione" = '2026-11-10' WHERE "condizioniVersione" IS NULL;
UPDATE "User" SET "regoleVersione" = '2026-11-10' WHERE "regoleVersione" IS NULL AND "master" = false;
