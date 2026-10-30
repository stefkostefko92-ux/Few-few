-- Round 52: the relazione tecnica di modifica after the owner's model (RT engine 2.x) is made on the installation's
-- «Calcolo argano» alone — no machine room survey or lift design as its base. The first RT's records (engine 1.x) keep
-- exactly one of the two; an RT never names both. Additive: no row changes (existing rows are all 1.x with one base).
--
-- Rollback (only while no 2.x row exists):
--   ALTER TABLE "TechnicalReport" DROP CONSTRAINT "TechnicalReport_base_check";
--   ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_one_base_check" CHECK (("roomDesignId" IS NULL) <> ("liftDesignId" IS NULL));
ALTER TABLE "TechnicalReport" DROP CONSTRAINT "TechnicalReport_one_base_check";
ALTER TABLE "TechnicalReport" ADD CONSTRAINT "TechnicalReport_base_check" CHECK (
  NOT ("roomDesignId" IS NOT NULL AND "liftDesignId" IS NOT NULL)
  AND ("engineVersion" LIKE '2.%' OR (("roomDesignId" IS NULL) <> ("liftDesignId" IS NULL)))
);
