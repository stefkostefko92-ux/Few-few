-- Правният преглед преди пускането (28 ноември 2026). Само добавя.

-- Оттеглената смяна на доставчика (условията 2026-11-29, чл. 12.7 и B.6): ново искане след оттегляне не вдига
-- „само четене“.
ALTER TABLE "Azienda" ADD COLUMN "cambioRevocatoAt" TIMESTAMP(3);

-- Изтриването на акаунт (Allegato A, A.9): обезличаване на деактивиран акаунт.
ALTER TABLE "User" ADD COLUMN "cancellatoAt" TIMESTAMP(3);
ALTER TABLE "User"
  ADD CONSTRAINT "User_cancellato_check" CHECK ("cancellatoAt" IS NULL OR "deactivatedAt" IS NOT NULL);
