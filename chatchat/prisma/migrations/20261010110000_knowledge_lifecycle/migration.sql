-- Жизнен цикъл на знанието (решение на собственика: „старите документи се пазят, не се
-- обновяват; всяко ново табло има уникални схеми“) + задължителните метаданни §7.2/§4.1.
-- Само адитивно: нови колони/индекси/ограничения; съществуващите данни се допълват без загуба.

-- 1. Документ: кой го е пратил за преглед (четири очи и при възстановяване).
ALTER TABLE "Document" ADD COLUMN "submittedById" TEXT;

-- Пратените за преглед преди миграцията: последният submit от одита (ако го има).
UPDATE "Document" d
SET "submittedById" = (
  SELECT a."actorId" FROM "AuditEvent" a
  WHERE a."objectType" = 'document' AND a."objectId" = d.id AND a.action = 'kb.document.submit'
  ORDER BY a.id DESC LIMIT 1
)
WHERE d.status = 'REVIEW';

-- 2. effectiveFrom е задължителен: съществуващите са в сила от публикуването си (или от
-- създаването), но никога след собствения си effectiveTo.
UPDATE "Document"
SET "effectiveFrom" = LEAST(
  COALESCE("publishedAt", "createdAt"),
  COALESCE("effectiveTo", COALESCE("publishedAt", "createdAt"))
)
WHERE "effectiveFrom" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "effectiveFrom" SET NOT NULL;
-- NOT VALID: важи за всеки нов/променен ред; стар ред с въведени по-рано обратни дати не спира
-- миграцията (данните не се пипат — документите са неизменими).
ALTER TABLE "Document" ADD CONSTRAINT "Document_effective_range_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom") NOT VALID;

-- 3. Приложимост: изричен фърмуер („всички версии“ вместо мълчалив null) и конкретно табло.
ALTER TABLE "DocumentApplicability" ADD COLUMN "allFirmware" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deviceId" TEXT;

-- Досегашното „без fwMin/fwMax“ значеше „всички версии“ — вече го казваме изрично.
UPDATE "DocumentApplicability" SET "allFirmware" = true WHERE "fwMin" IS NULL AND "fwMax" IS NULL;

ALTER TABLE "DocumentApplicability" ADD CONSTRAINT "DocumentApplicability_firmware_explicit_check"
  CHECK (("allFirmware" AND "fwMin" IS NULL AND "fwMax" IS NULL)
      OR (NOT "allFirmware" AND ("fwMin" IS NOT NULL OR "fwMax" IS NOT NULL)));

CREATE INDEX "DocumentApplicability_deviceId_idx" ON "DocumentApplicability"("deviceId");

ALTER TABLE "DocumentApplicability" ADD CONSTRAINT "DocumentApplicability_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Кодове за грешка (FR-04): кой е подготвил версията и кой я е одобрил.
ALTER TABLE "ErrorCode" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "authorIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Авторите на съществуващите версии — от одита (създаване и пресвързване).
UPDATE "ErrorCode" e
SET "authorIds" = ARRAY(
  SELECT DISTINCT a."actorId" FROM "AuditEvent" a
  WHERE a."objectType" = 'error' AND a."objectId" = e.id
    AND a.action IN ('kb.error.create', 'kb.error.relink') AND a."actorId" IS NOT NULL
  ORDER BY a."actorId"
);

CREATE INDEX "ErrorCode_tenantId_status_idx" ON "ErrorCode"("tenantId", "status");
