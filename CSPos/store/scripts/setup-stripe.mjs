// Създава (идемпотентно, по lookup_key) продукта и трите цени в Stripe.
// Пускане: STRIPE_SECRET_KEY=sk_... npm run setup:stripe

import Stripe from "stripe";
import { PLANS } from "../lib/plans.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Задай STRIPE_SECRET_KEY.");
  process.exit(1);
}

const PRODUCT_NAME = "Carbon Stealth POS";

let product = (await stripe.products.search({ query: `name:"${PRODUCT_NAME}" AND active:"true"` })).data[0];
if (!product) {
  product = await stripe.products.create({
    name: PRODUCT_NAME,
    description: "Касова система за хранителни магазини — лиценз на каса.",
    tax_code: "txcd_10000000", // общ дигитален продукт/SaaS — свери в Stripe Tax
  });
  console.log("Създаден продукт:", product.id);
} else {
  console.log("Продуктът съществува:", product.id);
}

for (const [id, p] of Object.entries(PLANS)) {
  const existing = await stripe.prices.list({ lookup_keys: [p.lookupKey], limit: 1 });
  if (existing.data[0]) {
    console.log(`Цена ${id} съществува:`, existing.data[0].id);
    continue;
  }
  const price = await stripe.prices.create({
    product: product.id,
    currency: "eur",
    unit_amount: p.unitAmount,
    lookup_key: p.lookupKey,
    tax_behavior: "exclusive", // цените са без ДДС; Stripe Tax добавя
    ...(p.interval ? { recurring: { interval: p.interval } } : {}),
    nickname: `${PRODUCT_NAME} — ${p.label}`,
  });
  console.log(`Създадена цена ${id}:`, price.id);
}
console.log("Готово. Включи Stripe Tax (Dashboard → Tax) и добави webhook endpoint /api/webhook.");
