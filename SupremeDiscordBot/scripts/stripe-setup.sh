#!/usr/bin/env bash
# scripts/stripe-setup.sh — еднократна Stripe конфигурация за Supreme Bot.
#
# Прави (идемпотентно — безопасно за повторно пускане):
#   1. Продукт "Supreme Bot Premium" + месечна цена €9,99 (EUR, recurring)
#      → отпечатва STRIPE_PRICE_ID за backend/.env
#   2. Webhook endpoint към /api/stripe/webhook със 7-те събития, които
#      кодът обработва → отпечатва STRIPE_WEBHOOK_SECRET (само при създаване)
#   3. Данъчна регистрация България (ЗДДС, standard) за Stripe Tax
#
# Употреба:
#   STRIPE_SECRET_KEY=sk_test_... bash scripts/stripe-setup.sh          # test mode
#   STRIPE_SECRET_KEY=sk_live_... bash scripts/stripe-setup.sh          # live mode
#   DOMAIN=https://supreme.carbonstealth.eu (по подразбиране)
#
# ЗАБЕЛЕЖКА: ключът се подава само през env — никога не влиза в repo-то.
set -euo pipefail

: "${STRIPE_SECRET_KEY:?Задай STRIPE_SECRET_KEY=sk_test_... или sk_live_...}"
DOMAIN="${DOMAIN:-https://supreme.carbonstealth.eu}"
API="https://api.stripe.com/v1"
AUTH=(-u "${STRIPE_SECRET_KEY}:")

MODE="LIVE"; [[ "$STRIPE_SECRET_KEY" == sk_test_* ]] && MODE="TEST"
echo "══ Stripe setup (${MODE} mode) → ${DOMAIN} ══"

# ─── 1. Продукт + цена (идемпотентно през lookup_key) ────────────────────────
PRICE_JSON=$(curl -sS "${AUTH[@]}" "$API/prices?lookup_keys[]=supreme_premium_monthly&limit=1")
PRICE_ID=$(echo "$PRICE_JSON" | grep -o '"id": *"price_[^"]*"' | head -1 | sed 's/.*"\(price_[^"]*\)"/\1/')

if [ -z "$PRICE_ID" ]; then
  echo "→ Създавам продукт Supreme Bot Premium..."
  PRODUCT_ID=$(curl -sS "${AUTH[@]}" "$API/products" \
    -d name="Supreme Bot Premium" \
    -d "description=Premium tier: up to 50 panels/forms, AI auto-replies, white-label bot, webhooks, unlimited transcript retention" \
    -d "default_price_data[currency]=eur" \
    -d "default_price_data[unit_amount]=999" \
    -d "default_price_data[recurring][interval]=month" \
    -d "default_price_data[tax_behavior]=inclusive" \
    | grep -o '"id": *"prod_[^"]*"' | head -1 | sed 's/.*"\(prod_[^"]*\)"/\1/')
  [ -n "$PRODUCT_ID" ] || { echo "✗ Продуктът не се създаде — провери ключа."; exit 1; }
  # Слагаме lookup_key на цената за бъдеща идемпотентност
  DEFAULT_PRICE=$(curl -sS "${AUTH[@]}" "$API/products/$PRODUCT_ID" | grep -o '"default_price": *"price_[^"]*"' | sed 's/.*"\(price_[^"]*\)"/\1/')
  curl -sS "${AUTH[@]}" "$API/prices/$DEFAULT_PRICE" -d lookup_key=supreme_premium_monthly >/dev/null
  PRICE_ID="$DEFAULT_PRICE"
  echo "  ✓ Продукт $PRODUCT_ID + цена $PRICE_ID (€9,99/мес, ДДС включен в цената)"
else
  echo "  ✓ Цената вече съществува: $PRICE_ID"
fi

# ─── 2. Webhook endpoint (7-те събития, които backend-ът обработва) ──────────
WH_URL="${DOMAIN}/api/stripe/webhook"
EXISTING_WH=$(curl -sS "${AUTH[@]}" "$API/webhook_endpoints?limit=100" | grep -c "\"url\": *\"$WH_URL\"" || true)
if [ "$EXISTING_WH" -eq 0 ]; then
  echo "→ Създавам webhook endpoint $WH_URL ..."
  WH_JSON=$(curl -sS "${AUTH[@]}" "$API/webhook_endpoints" \
    -d url="$WH_URL" \
    -d "enabled_events[]=checkout.session.completed" \
    -d "enabled_events[]=invoice.paid" \
    -d "enabled_events[]=invoice.payment_failed" \
    -d "enabled_events[]=customer.subscription.updated" \
    -d "enabled_events[]=customer.subscription.deleted" \
    -d "enabled_events[]=charge.refunded" \
    -d "enabled_events[]=charge.dispute.created" \
    -d description="Supreme Bot backend — подписан, идемпотентен по event.id")
  WH_SECRET=$(echo "$WH_JSON" | grep -o '"secret": *"whsec_[^"]*"' | sed 's/.*"\(whsec_[^"]*\)"/\1/')
  echo "  ✓ Webhook създаден."
  echo "  ⚠ ЗАПИШИ СЕГА (показва се само веднъж): STRIPE_WEBHOOK_SECRET=${WH_SECRET}"
else
  echo "  ✓ Webhook за $WH_URL вече съществува (signing secret: Dashboard → Webhooks → Reveal)."
fi

# ─── 3. Данъчна регистрация БГ (ЗДДС) за Stripe Tax ──────────────────────────
HAS_BG=$(curl -sS "${AUTH[@]}" "$API/tax/registrations?status=active&limit=100" | grep -c '"country": *"BG"' || true)
if [ "$HAS_BG" -eq 0 ]; then
  echo "→ Добавям данъчна регистрация BG (standard/ЗДДС)..."
  curl -sS "${AUTH[@]}" "$API/tax/registrations" \
    -d country=BG \
    -d active_from=now \
    -d "country_options[bg][type]=standard" >/dev/null \
    && echo "  ✓ BG регистрация активна — automatic_tax ще начислява 20% ДДС." \
    || echo "  ⚠ Регистрацията не мина — добави я ръчно: Dashboard → Settings → Tax → Registrations."
else
  echo "  ✓ BG данъчна регистрация вече е активна."
fi

echo ""
echo "══ Готово. Попълни в backend/.env: ══"
echo "  STRIPE_SECRET_KEY=<ключът, с който пусна скрипта>"
echo "  STRIPE_PRICE_ID=${PRICE_ID}"
echo "  STRIPE_WEBHOOK_SECRET=<whsec_... отгоре или от Dashboard>"
echo ""
echo "Ръчно остава само: Dashboard → Settings → Tax → потвърди origin address"
echo "(ul. Samuil 3, 2670 Bobov dol, BG), и при >€10k/год. трансгранични B2C — OSS."
