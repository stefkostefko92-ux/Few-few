-- Плащанията след одита от 12 ноември 2026 (само добавя): планът в опашка при офертата (`baseCambioAt`), следата на
-- превърнатия кредит (`creditoDa`), причината за ръчна проверка, връщането (чл. 12.9) и отметката „фактурирано“.
ALTER TABLE "Pagamento" ADD COLUMN "baseCambioAt" TIMESTAMP(3),
ADD COLUMN "creditoDa" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "verificaMotivo" VARCHAR(30),
ADD COLUMN "rimborsoCent" INTEGER,
ADD COLUMN "rimborsatoAt" TIMESTAMP(3),
ADD COLUMN "fatturataAt" TIMESTAMP(3);

ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_verifica_rimborso_check" CHECK (
  ("stato" <> 'DA_VERIFICARE' OR ("revolutOrderId" IS NOT NULL AND "verificaMotivo" IS NOT NULL))
  AND ("stato" <> 'RIMBORSATO' OR ("rimborsoCent" IS NOT NULL AND "rimborsatoAt" IS NOT NULL))
  AND ("rimborsoCent" IS NULL) = ("rimborsatoAt" IS NULL)
  AND ("rimborsoCent" IS NULL OR "rimborsoCent" >= 0)
);

CREATE INDEX "Pagamento_fatturataAt_idx" ON "Pagamento"("fatturataAt");
