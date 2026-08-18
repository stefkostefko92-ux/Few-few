-- v37 — по избор отделен лог канал за всяка категория събития.
-- Адитивна и NULL-able: заварените сървъри продължават да ползват общия
-- eventLogChannelId, докато собственикът не зададе канал за дадена категория.
ALTER TABLE "servers" ADD COLUMN "eventLogChannels" JSONB;

-- Позиция в групово съобщение (няколко панела с общ messageId). NULL за
-- самостоятелните панели; без нея редът се разбъркваше при редакция.
ALTER TABLE "panels" ADD COLUMN "groupOrder" INTEGER;

-- Режим на груповото съобщение (DROPDOWN | BUTTONS | STACK). NULL за
-- самостоятелните панели и за заварените групи (третират се като STACK).
ALTER TABLE "panels" ADD COLUMN "groupMode" TEXT;
