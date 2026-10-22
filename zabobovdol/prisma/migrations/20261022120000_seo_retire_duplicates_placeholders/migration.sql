-- САМО ДАННИ (схемата не се променя). SEO почистване по одита за Google Search
-- от 22.10.2026. Сийдовете се пускат само при първа инсталация, а миграциите —
-- при всеки деплой, затова поправката на заварената база е тук.
-- Щадящо и идемпотентно: нищо не се трие — записите само се скриват
-- (published = false) или се маха наш собствен маркер за примерни данни;
-- повторно изпълнение не променя нищо.

-- 1) Дублирани ръководства „Как да…“ — същото заглавие и почти същият текст като
--    друго ръководство. Остава едно канонично; оттеглените адреси водят с 301
--    към него (src/lib/guide-redirects.ts → src/middleware.ts).
UPDATE "Faq"
SET "published" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "published" = true
  AND "slug" IN (
    'z-televiziya-online2',  -- → fun-tv-online
    'c-proverya-globi-kat',  -- → docs-kat-globi
    'm-falshiva-banknota2',  -- → money-falshiva-banknota
    'c-zdravno-dosie2',      -- → docs-zdravno-dosie
    'c-elektronna-recepta2'  -- → docs-elektronna-recepta
  );

-- 2) Примерното събитие от началния сийд — несъществуващо събитие, публикувано
--    с Event структурирани данни. Скрива се само ако още е примерното (ако
--    админът го е превърнал в реално събитие, не се пипа).
UPDATE "Event"
SET "published" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'primerno-sabitie'
  AND "published" = true
  AND "description" LIKE '%[примерни данни%';

-- 3) Остатъци от примерните данни в записи, които админът е превърнал в реални:
--    фиктивният телефон „000 000 000“ и бележката „[примерни данни — …]“.
--    Влизаха във видимия текст, в meta description и в LocalBusiness разметката.
UPDATE "Business" SET "phone" = '', "updatedAt" = CURRENT_TIMESTAMP
WHERE "phone" = '000 000 000';

UPDATE "Service" SET "phone" = '', "updatedAt" = CURRENT_TIMESTAMP
WHERE "phone" = '000 000 000';

UPDATE "Service" SET "phone2" = '', "updatedAt" = CURRENT_TIMESTAMP
WHERE "phone2" = '000 000 000';

UPDATE "Business"
SET "description" = REPLACE("description", ' [примерни данни — заменете от админ панела]', ''),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "description" LIKE '% [примерни данни — заменете от админ панела]%';

UPDATE "Service"
SET "description" = REPLACE("description", ' [примерни данни — заменете от админ панела]', ''),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "description" LIKE '% [примерни данни — заменете от админ панела]%';

UPDATE "Faq"
SET "answer" = REPLACE("answer", ' [примерни данни — заменете от админ панела]', ''),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "answer" LIKE '% [примерни данни — заменете от админ панела]%';
