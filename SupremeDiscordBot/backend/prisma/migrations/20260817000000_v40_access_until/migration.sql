-- v40 — достъп до края на платения период при ОТМЯНА (решение на собственика).
--
-- Клиент, който отмени абонамента си, е платил текущия период и трябва да го
-- доизползва. Досега customer.subscription.deleted отнемаше достъпа В МОМЕНТА на
-- събитието — при незабавна отмяна това значеше, че клиентът губи дни, за които
-- вече е платил.
--
-- При refund/chargeback поведението е ОБРАТНОТО: парите се връщат, значи
-- достъпът пада веднага и колоната се занулява.
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "accessUntil" TIMESTAMP(3);

-- Четците филтрират по нея на всяка заявка за ефективен план.
CREATE INDEX IF NOT EXISTS "servers_accessUntil_idx" ON "servers"("accessUntil");

-- Тарифата, за която е платено. `plan` пада на "free" при отмяна, затова без
-- тази колона гратисният период връща „premium“ на клиент, платил whitelabel.
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "gracePlan" TEXT;

-- Агенциите имат същата семантика: местата живеят до края на платения период.
ALTER TABLE "agencies" ADD COLUMN IF NOT EXISTS "accessUntil" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "agencies_accessUntil_idx" ON "agencies"("accessUntil");
