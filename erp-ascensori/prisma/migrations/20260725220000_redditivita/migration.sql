-- Данните, без които въпросът „този договор изкарва ли пари" няма отговор.
--
-- Приходът се вижда — фактурите са там. Разходът не: часовете на техника,
-- вложените материали и платеното на котимиста живеят в три различни модула и
-- нищо не ги свързва с конкретната работа.
--
-- Липсващата цена НЕ се брои за нула в отчета, а за НЕИЗВЕСТНА: нулата прави
-- договора да изглежда печеливш точно когато данните липсват.

ALTER TABLE "dipendenti" ADD COLUMN "costoOrario" DECIMAL(10,2);
ALTER TABLE "ordini_lavoro" ADD COLUMN "costoEsterno" DECIMAL(12,2);
ALTER TABLE "movimenti_magazzino" ADD COLUMN "ordineLavoroId" UUID;

CREATE INDEX "movimenti_magazzino_ordineLavoroId_idx" ON "movimenti_magazzino"("ordineLavoroId");
ALTER TABLE "movimenti_magazzino"
  ADD CONSTRAINT "movimenti_magazzino_ordineLavoroId_fkey"
  FOREIGN KEY ("ordineLavoroId") REFERENCES "ordini_lavoro"("id") ON DELETE SET NULL ON UPDATE CASCADE;
