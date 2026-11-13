-- v55 (А1) — котва за прозореца за експорт след отписване през Discord.
-- `revokeServer` записва кога е свършил платеният достъп; `inExportWindow` и
-- метлата за архиви стъпват на него. НЕ вдига плана (accessUntil го вдига).
-- Адитивна миграция — една nullable колона.

-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "paidAccessEndedAt" TIMESTAMP(3);

-- v55 (А5) — повтарящи се насрочени съобщения: зоната, в която е въведен часът,
-- и денят от месеца. Без тях дневното съобщение бягаше с час при смяната на
-- времето, а месечното на 31-во се изместваше трайно на 3-то число.
-- Адитивно — две nullable колони; null = досегашното поведение (UTC).

-- AlterTable
ALTER TABLE "scheduled_messages" ADD COLUMN     "timeZone" TEXT,
ADD COLUMN     "anchorDay" INTEGER;

-- v55 (И1) — върната покупка в магазина. Отделна от revokedAt, която се слага и при
-- изтекла временна роля: само върнатото освобождава бройка от ограничен артикул.
-- Адитивно — една nullable колона.

-- AlterTable
ALTER TABLE "shop_purchases" ADD COLUMN     "refundedAt" TIMESTAMP(3);
