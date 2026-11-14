-- Изключените оферти на фирма с данни: оферти, клиенти и ценоразпис остават за четене и изтриване
-- (собственикът, 14 ноември 2026; условията, A.9). Само добавя: колона, попълване, проверка.
ALTER TABLE "Azienda" ADD COLUMN "preventiviArchivio" BOOLEAN NOT NULL DEFAULT false;

-- Фирмите, на които офертите вече са изключени, а данните им са в базата.
UPDATE "Azienda" a
SET "preventiviArchivio" = true
WHERE NOT a."preventiviAttivi"
  AND (
    EXISTS (SELECT 1 FROM "Preventivo" p WHERE p."aziendaId" = a."id")
    OR EXISTS (SELECT 1 FROM "Cliente" c WHERE c."aziendaId" = a."id")
    OR EXISTS (SELECT 1 FROM "VoceListino" v WHERE v."aziendaId" = a."id")
  );

-- Архивът е само при изключени оферти.
ALTER TABLE "Azienda"
  ADD CONSTRAINT "Azienda_preventivi_archivio_check"
  CHECK (NOT ("preventiviAttivi" AND "preventiviArchivio"));
