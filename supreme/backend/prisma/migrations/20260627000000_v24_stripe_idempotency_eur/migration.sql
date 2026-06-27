-- F1+F2 — Идемпотентност на Stripe webhook-и по event.id.
-- Маркерът се записва в същата транзакция като бизнес-ефекта; втора доставка
-- на същото събитие хвърля unique violation (P2002) → ефектът не се дублира.
CREATE TABLE "processed_stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("id")
);

-- F6 — продуктът таксува в евро (ЕС): сменяме валутния default от "usd" на "eur".
-- Засяга само НОВИ редове без подадена валута; съществуващите редове не се пипат.
ALTER TABLE "payment_logs" ALTER COLUMN "currency" SET DEFAULT 'eur';
ALTER TABLE "referral_commissions" ALTER COLUMN "currency" SET DEFAULT 'eur';
