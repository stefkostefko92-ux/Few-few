-- Purchase: реално платената сума + валута. Приходите в админ таблото се
-- сумират от тях, вместо текуща цена × брой (историята се преизчисляваше при
-- всяка смяна на цената от админа).
ALTER TABLE "Purchase" ADD COLUMN "amountCents" INTEGER;
ALTER TABLE "Purchase" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'eur';

-- Backfill на старите редове от текущата цена на продукта (най-доброто налично
-- приближение — реалната сума за тях не е записвана). Всички досегашни сесии
-- са в EUR (checkout ползваше currency: "eur").
UPDATE "Purchase" p
SET "amountCents" = pr."priceCents"
FROM "Product" pr
WHERE pr."id" = p."productId" AND p."amountCents" IS NULL;

-- FK гарантира продукт за всеки ред; предпазно 0 за всеки останал NULL.
UPDATE "Purchase" SET "amountCents" = 0 WHERE "amountCents" IS NULL;

ALTER TABLE "Purchase" ALTER COLUMN "amountCents" SET NOT NULL;
