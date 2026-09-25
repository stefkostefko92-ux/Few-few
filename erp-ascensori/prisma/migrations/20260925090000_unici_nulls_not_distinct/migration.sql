-- Уникалните индекси с `tenantId` отказват дубликат И когато фирмата е NULL.
--
-- ДЕФЕКТЪТ. В Postgres по подразбиране два NULL-а в уникален индекс са
-- РАЗЛИЧНИ стойности. `@@unique([tenantId, numero])` следователно пазеше само
-- многофирмената инсталация — а продуктът се продава по ЕДНА инсталация на
-- клиент, тоест `tenantId` е NULL на всеки ред. `conNumero`
-- (src/lib/numerazione.ts) разчита изцяло на нарушението на този индекс
-- (P2002), за да хване състезание: две едновременни заявки четяха един и същ
-- максимум и записваха ЕДИН И СЪЩ номер на фактура — без грешка. Възпроизведено
-- на PG16: два реда `DDT-2026-0001`, `tenantId` NULL, нула нарушения.
--
-- Засегнати са 12 индекса: шестте номерации (чл. 21 D.P.R. 633/1972 иска
-- прогресивен и НЕПОВТАРЯЩ СЕ номер), броячът за прогресивния номер на файла
-- към SDI (дубликат = отхвърлен файл), единичният запис с данните на фирмата,
-- матриколата, регистрационният номер, кодът на артикула и ключът за
-- идемпотентност на опашката от известия.
--
-- ПОПРАВКАТА е `NULLS NOT DISTINCT` (PG15+; образът е postgres:16). Prisma не
-- може да го изрази в схемата, но и не го вижда като разлика: `prisma migrate
-- diff` срещу базата след тази миграция дава „No difference detected", тоест
-- гейтът за дрейф в CI минава. Цената: база, вдигната с `prisma db push`
-- (само за разработка), няма тази защита — продукцията минава САМО през
-- `migrate deploy`, а `/api/readyz` проверява, че защитата е налице.
--
-- ПРЕДВАРИТЕЛНА ПРОВЕРКА. Ако базата вече съдържа дубликати, създаването на
-- индекса би паднало с безлично „could not create unique index". Проверката
-- по-долу пада ПРЕДИ да е пипнато каквото и да е и казва коя таблица и колко —
-- защото поправката на дублиран номер на фактура е решение на счетоводителя,
-- не на миграция.

DO $$
DECLARE
  r record;
  n bigint;
  colpevoli text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('articoli_magazzino', '"tenantId", codice'),
    ('automezzi',          '"tenantId", targa'),
    ('contatori_sdi',      '"tenantId"'),
    ('contratti',          '"tenantId", numero'),
    ('dati_azienda',       '"tenantId"'),
    ('ddt',                '"tenantId", numero'),
    ('fatture',            '"tenantId", numero'),
    ('impianti',           '"tenantId", matricola'),
    ('notifiche',          '"tenantId", chiave, destinatario'),
    ('ordini_lavoro',      '"tenantId", numero'),
    ('preventivi',         '"tenantId", numero'),
    ('rapportini',         '"tenantId", numero')
  ) AS t(tabella, colonne)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM (SELECT 1 FROM %I GROUP BY %s HAVING count(*) > 1) d',
      r.tabella, r.colonne
    ) INTO n;
    IF n > 0 THEN
      colpevoli := colpevoli || format(' %s (%s gruppi duplicati su %s);', r.tabella, n, r.colonne);
    END IF;
  END LOOP;
  IF colpevoli <> '' THEN
    RAISE EXCEPTION 'Valori duplicati da risolvere prima della migrazione:%', colpevoli
      USING HINT = 'Un numero di documento duplicato va corretto con il commercialista: la migrazione non sceglie quale dei due è quello valido.';
  END IF;
END $$;

DROP INDEX "articoli_magazzino_tenantId_codice_key";
CREATE UNIQUE INDEX "articoli_magazzino_tenantId_codice_key" ON "articoli_magazzino" ("tenantId", "codice") NULLS NOT DISTINCT;

DROP INDEX "automezzi_tenantId_targa_key";
CREATE UNIQUE INDEX "automezzi_tenantId_targa_key" ON "automezzi" ("tenantId", "targa") NULLS NOT DISTINCT;

DROP INDEX "contatori_sdi_tenantId_key";
CREATE UNIQUE INDEX "contatori_sdi_tenantId_key" ON "contatori_sdi" ("tenantId") NULLS NOT DISTINCT;

DROP INDEX "contratti_tenantId_numero_key";
CREATE UNIQUE INDEX "contratti_tenantId_numero_key" ON "contratti" ("tenantId", "numero") NULLS NOT DISTINCT;

DROP INDEX "dati_azienda_tenantId_key";
CREATE UNIQUE INDEX "dati_azienda_tenantId_key" ON "dati_azienda" ("tenantId") NULLS NOT DISTINCT;

DROP INDEX "ddt_tenantId_numero_key";
CREATE UNIQUE INDEX "ddt_tenantId_numero_key" ON "ddt" ("tenantId", "numero") NULLS NOT DISTINCT;

DROP INDEX "fatture_tenantId_numero_key";
CREATE UNIQUE INDEX "fatture_tenantId_numero_key" ON "fatture" ("tenantId", "numero") NULLS NOT DISTINCT;

DROP INDEX "impianti_tenantId_matricola_key";
CREATE UNIQUE INDEX "impianti_tenantId_matricola_key" ON "impianti" ("tenantId", "matricola") NULLS NOT DISTINCT;

DROP INDEX "notifiche_tenantId_chiave_destinatario_key";
CREATE UNIQUE INDEX "notifiche_tenantId_chiave_destinatario_key" ON "notifiche" ("tenantId", "chiave", "destinatario") NULLS NOT DISTINCT;

DROP INDEX "ordini_lavoro_tenantId_numero_key";
CREATE UNIQUE INDEX "ordini_lavoro_tenantId_numero_key" ON "ordini_lavoro" ("tenantId", "numero") NULLS NOT DISTINCT;

DROP INDEX "preventivi_tenantId_numero_key";
CREATE UNIQUE INDEX "preventivi_tenantId_numero_key" ON "preventivi" ("tenantId", "numero") NULLS NOT DISTINCT;

DROP INDEX "rapportini_tenantId_numero_key";
CREATE UNIQUE INDEX "rapportini_tenantId_numero_key" ON "rapportini" ("tenantId", "numero") NULLS NOT DISTINCT;
