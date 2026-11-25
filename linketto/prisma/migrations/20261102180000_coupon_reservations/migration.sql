-- Резервация на промо код при старт на checkout (Продавача, 02.11.2026):
-- еднократен код вече не дава N продажби с отстъпка. Адитивно: само нова
-- таблица; съществуващите редове и колони не се пипат. Заварените сесии
-- (без metadata.couponReservationId) се броят от webhook-а както досега.
-- clientKey = HMAC(IP, код) за тавана на държаните резервации от един клиент
-- (суров IP не се пази; ключът се нулира при уреждане на резервацията).
-- CreateTable
CREATE TABLE "CouponReservation" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "stripeSessionId" TEXT,
    "clientKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "CouponReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CouponReservation_stripeSessionId_key" ON "CouponReservation"("stripeSessionId");

-- CreateIndex
CREATE INDEX "CouponReservation_couponId_idx" ON "CouponReservation"("couponId");

-- CreateIndex
CREATE INDEX "CouponReservation_status_createdAt_idx" ON "CouponReservation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CouponReservation_couponId_clientKey_status_idx" ON "CouponReservation"("couponId", "clientKey", "status");

-- AddForeignKey
ALTER TABLE "CouponReservation" ADD CONSTRAINT "CouponReservation_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
