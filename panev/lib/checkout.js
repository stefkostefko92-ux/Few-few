'use strict';
// Параметрите на Stripe Checkout сесията (чиста логика; тест: test/checkout.test.js).
// Онлайн плащането е спряно (PAYMENTS_ENABLED в server.js), но включено НИКОГА не бива да даде
// цена без ДДС:
//  - цените в ценоразписа са IVA esclusa → всеки ред носи Stripe Tax Rate „IVA 22%“
//    (exclusive), проверен на сървъра преди сесията (fail-closed). Избран е фиксиран Tax Rate,
//    не automatic_tax: Stripe Tax без активна регистрация връща not_collecting и 0 ДДС.
//  - доставка само в Италия: Сан Марино и Ватикана са необлагаеми доставки по чл. 71 DPR
//    633/1972 със собствена процедура (код на икономическия оператор, е-фактура) — не се
//    обслужват онлайн, само по оферта (/api/contact).
//  - P.IVA НЕ се събира в Checkout: Stripe Tax прилага обратно начисляване само по ФОРМАТА на
//    номера, независимо от VIES (docs.stripe.com/billing/customer/tax-ids). Продажбата е
//    вътрешна (IT → IT) и е с IVA; номерът от формата отива в метаданните за фактурата.

const crypto = require('crypto');

const IVA_PERCENT = 22;
const SHIPPING_COUNTRIES = Object.freeze(['IT']);

function isItalianPiva(raw) {
  return /^(IT)?[0-9]{11}$/i.test(String(raw || '').replace(/\s/g, ''));
}

/** Ред с IVA: без Tax Rate редът не се строи (fail-closed). */
function checkoutLineItem({ name, description, unitAmountCents, qty }, ivaTaxRateId) {
  if (typeof ivaTaxRateId !== 'string' || !ivaTaxRateId.startsWith('txr_')) {
    throw new Error('IVA: липсва Tax Rate за реда');
  }
  return {
    price_data: {
      currency: 'eur',
      product_data: { name, description },
      unit_amount: unitAmountCents,
    },
    quantity: qty,
    tax_rates: [ivaTaxRateId],
  };
}

/**
 * Канонична P.IVA — една и съща за Idempotency-Key и за метаданните: „IT“ + 11 цифри
 * („12345678901“, „it 1234567 8901“ → „IT12345678901“). Невалидното остава без интервали
 * (server.js го отхвърля с isItalianPiva преди сесията).
 */
function normalizePiva(raw) {
  const s = String(raw || '').replace(/\s/g, '').toUpperCase();
  return /^(IT)?[0-9]{11}$/.test(s) ? 'IT' + s.slice(-11) : s;
}

/**
 * Idempotency-Key на сесията: повторена заявка (мрежов ретрай) → същата сесия; различна P.IVA
 * при същата количка → различна сесия (иначе P.IVA в метаданните/фактурата е от първата заявка).
 */
function checkoutIdempotencyKey({ clientIp, lineItems, email, piva }) {
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify(lineItems) + (email || '') + '|' + normalizePiva(piva))
    .digest('hex').slice(0, 32);
  return 'co_' + clientIp + '_' + digest;
}

function checkoutSessionParams({ lineItems, email, metadata, piva, baseUrl }) {
  const meta = { ...metadata, partita_iva: normalizePiva(piva) };
  return {
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: lineItems,
    customer_email: email || undefined,
    billing_address_collection: 'required',
    shipping_address_collection: { allowed_countries: [...SHIPPING_COUNTRIES] },
    success_url: `${baseUrl}/contatti?ordine=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/prodotti?annullato=1`,
    payment_intent_data: { metadata: meta },
    metadata: meta,
    locale: 'it',
  };
}

/**
 * Tax Rate ID от env (STRIPE_TAX_RATE_IVA22), проверен срещу Stripe: активен, exclusive,
 * 22%, държава IT. Всичко друго → грешка (checkout-ът отговаря 503, без сесия).
 */
async function resolveIvaTaxRateId(stripe, env) {
  const id = String(env.STRIPE_TAX_RATE_IVA22 || '');
  if (!id.startsWith('txr_')) throw new Error('IVA: STRIPE_TAX_RATE_IVA22 липсва или е невалиден');
  const rate = await stripe.taxRates.retrieve(id);
  if (!rate.active || rate.inclusive !== false || rate.percentage !== IVA_PERCENT || rate.country !== 'IT') {
    throw new Error('IVA: Tax Rate-ът не е активна IT 22% exclusive ставка');
  }
  return id;
}

module.exports = {
  IVA_PERCENT,
  SHIPPING_COUNTRIES,
  isItalianPiva,
  checkoutIdempotencyKey,
  checkoutLineItem,
  checkoutSessionParams,
  resolveIvaTaxRateId,
};
