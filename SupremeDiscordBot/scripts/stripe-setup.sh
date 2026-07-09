#!/usr/bin/env bash
# scripts/stripe-setup.sh — еднократна Stripe конфигурация за Supreme Bot (v3.0 тарифи).
#
# Прави (идемпотентно — безопасно за повторно пускане, ключ по lookup_key):
#   1. Продукти + цени (месечни и годишни) за всички тарифи:
#        Premium      €9.99/мес · €99/год
#        White-label  €19.99/мес · €199/год
#        Agency 5     €39.99/мес · €399/год   (до 5 сървъра)
#        Agency 10    €79.99/мес · €799/год   (до 10 сървъра)
#      → отпечатва STRIPE_PRICE_* за backend/.env (имената съвпадат с lib/premium.js)
#   2. Webhook endpoint към /api/stripe/webhook със 7-те събития, които кодът
#      обработва → отпечатва STRIPE_WEBHOOK_SECRET (само при създаване)
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
echo "══ Stripe setup v3.0 (${MODE} mode) → ${DOMAIN} ══"

# ─── helpers ─────────────────────────────────────────────────────────────────
jq_id() { grep -o "\"id\": *\"${1}_[^\"]*\"" | head -1 | sed "s/.*\"\(${1}_[^\"]*\)\"/\1/"; }

price_by_lookup() { # $1=lookup_key → price id | ""
  curl -sS "${AUTH[@]}" "$API/prices?lookup_keys[]=$1&limit=1" \
    | grep -o '"id": *"price_[^"]*"' | head -1 | sed 's/.*"\(price_[^"]*\)"/\1/'
}
product_of_price() { # $1=price id → product id
  curl -sS "${AUTH[@]}" "$API/prices/$1" | grep -o '"product": *"prod_[^"]*"' | sed 's/.*"\(prod_[^"]*\)"/\1/'
}
create_product() { # $1=name $2=description → prod id
  curl -sS "${AUTH[@]}" "$API/products" -d name="$1" -d "description=$2" | jq_id prod
}
create_price() { # $1=product $2=amount(cents) $3=interval(month|year) $4=lookup_key → price id
  curl -sS "${AUTH[@]}" "$API/prices" \
    -d product="$1" -d currency=eur -d unit_amount="$2" \
    -d "recurring[interval]=$3" -d tax_behavior=inclusive -d lookup_key="$4" \
    | jq_id price
}

# Ensure a tier's monthly+yearly price exists; echoes "MONTH_ID|YEAR_ID".
ensure_tier() { # $1=key_base $2=name $3=desc $4=month_cents $5=year_cents
  local mk="${1}_monthly" yk="${1}_yearly"
  local mid yid prod
  mid=$(price_by_lookup "$mk"); yid=$(price_by_lookup "$yk")
  if [ -n "$mid" ]; then prod=$(product_of_price "$mid")
  elif [ -n "$yid" ]; then prod=$(product_of_price "$yid")
  else prod=$(create_product "$2" "$3"); fi
  [ -n "$prod" ] || { echo "✗ Продуктът $2 не се създаде — провери ключа." >&2; exit 1; }
  [ -z "$mid" ] && mid=$(create_price "$prod" "$4" month "$mk")
  [ -z "$yid" ] && yid=$(create_price "$prod" "$5" year "$yk")
  echo "${mid}|${yid}"
}

echo "→ Създавам/проверявам тарифите..."
PREMIUM=$(ensure_tier    supreme_premium    "Supreme Bot Premium"     "Up to 50 panels/forms, AI auto-replies, verification, giveaways, webhooks, REST API, unlimited retention. Per server." 999   9900)
WHITELABEL=$(ensure_tier supreme_whitelabel "Supreme Bot White-label" "Premium + white-label custom bot (your own Discord bot token, your brand). Per server."                          1999 19900)
AGENCY5=$(ensure_tier    supreme_agency5    "Supreme Bot Agency 5"    "White-label tier for up to 5 servers, one subscription, reseller-friendly."                                       3999 39900)
AGENCY10=$(ensure_tier   supreme_agency10   "Supreme Bot Agency 10"   "White-label tier for up to 10 servers, one subscription, reseller-friendly."                                      7999 79900)

PREM_M=${PREMIUM%|*};      PREM_Y=${PREMIUM#*|}
WL_M=${WHITELABEL%|*};     WL_Y=${WHITELABEL#*|}
A5_M=${AGENCY5%|*};        A5_Y=${AGENCY5#*|}
A10_M=${AGENCY10%|*};      A10_Y=${AGENCY10#*|}
echo "  ✓ Тарифите са готови (цените са с включен ДДС)."

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
    -d country=BG -d active_from=now -d "country_options[bg][type]=standard" >/dev/null \
    && echo "  ✓ BG регистрация активна — automatic_tax ще начислява 20% ДДС." \
    || echo "  ⚠ Регистрацията не мина — добави я ръчно: Dashboard → Settings → Tax → Registrations."
else
  echo "  ✓ BG данъчна регистрация вече е активна."
fi

echo ""
echo "══ Готово. Попълни в backend/.env: ══"
echo "  STRIPE_SECRET_KEY=<ключът, с който пусна скрипта>"
echo "  STRIPE_WEBHOOK_SECRET=<whsec_... отгоре или от Dashboard>"
echo "  STRIPE_PRICE_PREMIUM_MONTH=${PREM_M}"
echo "  STRIPE_PRICE_PREMIUM_YEAR=${PREM_Y}"
echo "  STRIPE_PRICE_WHITELABEL_MONTH=${WL_M}"
echo "  STRIPE_PRICE_WHITELABEL_YEAR=${WL_Y}"
echo "  STRIPE_PRICE_AGENCY5_MONTH=${A5_M}"
echo "  STRIPE_PRICE_AGENCY5_YEAR=${A5_Y}"
echo "  STRIPE_PRICE_AGENCY10_MONTH=${A10_M}"
echo "  STRIPE_PRICE_AGENCY10_YEAR=${A10_Y}"
echo ""
echo "Ръчно остава само: Dashboard → Settings → Tax → потвърди origin address"
echo "(ul. Samuil 3, 2670 Bobov dol, BG), и при >€10k/год. трансгранични B2C — OSS."
