-- Публично API и webhooks.
--
-- Ключът се пази САМО като SHA-256 отпечатък: показва се веднъж при създаване и
-- не може да бъде възстановен. Компрометирана база тогава не отваря API-то.
--
-- Правата (`ambiti`) и събитията (`eventi`) са празни по подразбиране — празно
-- значи НИЩО, не „всичко". Затворено по подразбиране, както навсякъде другаде.

CREATE TABLE "api_keys" (
  "id" UUID NOT NULL,
  "prefisso" TEXT NOT NULL,
  "chiaveHash" TEXT NOT NULL,
  "etichetta" TEXT NOT NULL,
  "ambiti" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "ultimoUso" TIMESTAMP(3),
  "scadenza" TIMESTAMP(3),
  "revocataAt" TIMESTAMP(3),
  "tenantId" UUID,
  "creataDaId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "api_keys_prefisso_key" ON "api_keys"("prefisso");
CREATE UNIQUE INDEX "api_keys_chiaveHash_key" ON "api_keys"("chiaveHash");
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

CREATE TABLE "webhooks" (
  "id" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "segreto" TEXT NOT NULL,
  "eventi" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "attivo" BOOLEAN NOT NULL DEFAULT true,
  "fallimenti" INTEGER NOT NULL DEFAULT 0,
  "tenantId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "webhooks_tenantId_idx" ON "webhooks"("tenantId");

CREATE TABLE "webhook_consegne" (
  "id" UUID NOT NULL,
  "webhookId" UUID NOT NULL,
  "evento" TEXT NOT NULL,
  "corpo" JSONB NOT NULL,
  "stato" TEXT NOT NULL DEFAULT 'IN_ATTESA',
  "tentativi" INTEGER NOT NULL DEFAULT 0,
  "prossimoTentativo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoErrore" TEXT,
  "rispostaStato" INTEGER,
  "consegnatoAt" TIMESTAMP(3),
  "tenantId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "webhook_consegne_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "webhook_consegne_stato_prossimoTentativo_idx" ON "webhook_consegne"("stato", "prossimoTentativo");
CREATE INDEX "webhook_consegne_tenantId_idx" ON "webhook_consegne"("tenantId");
ALTER TABLE "webhook_consegne" ADD CONSTRAINT "webhook_consegne_webhookId_fkey"
  FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Новите таблици влизат в изолацията по фирма като всички останали. Пропускането
-- им би оставило дупка точно там, където се раздават ключове за достъп.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_keys', 'webhooks', 'webhook_consegne'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (
          coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
          OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
        )
        WITH CHECK (
          coalesce(current_setting('app.tenant_id', true), '') IN ('', '*')
          OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '-')
        )$f$, t);
  END LOOP;
END
$$;
