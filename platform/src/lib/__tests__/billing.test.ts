import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapStripeStatus,
  isPremiumStatus,
  premiumFromStripe,
  billingStatusLabel,
  type StripeSubStatus,
} from "@/lib/billing";

test("mapStripeStatus: всеки Stripe статус се мапва към вътрешен", () => {
  assert.equal(mapStripeStatus("trialing"), "TRIALING");
  assert.equal(mapStripeStatus("active"), "ACTIVE");
  assert.equal(mapStripeStatus("past_due"), "PAST_DUE");
  assert.equal(mapStripeStatus("unpaid"), "UNPAID");
  assert.equal(mapStripeStatus("canceled"), "CANCELED");
  assert.equal(mapStripeStatus("incomplete"), "INCOMPLETE");
  assert.equal(mapStripeStatus("paused"), "INCOMPLETE");
  assert.equal(mapStripeStatus("incomplete_expired"), "CANCELED");
});

test("isPremiumStatus: премиум само при ACTIVE и TRIALING", () => {
  assert.equal(isPremiumStatus("ACTIVE"), true);
  assert.equal(isPremiumStatus("TRIALING"), true);
  // Всичко останало → без премиум (консервативно, без плащане).
  assert.equal(isPremiumStatus("PAST_DUE"), false);
  assert.equal(isPremiumStatus("UNPAID"), false);
  assert.equal(isPremiumStatus("CANCELED"), false);
  assert.equal(isPremiumStatus("INCOMPLETE"), false);
  assert.equal(isPremiumStatus("NONE"), false);
});

test("premiumFromStripe: active/trialing → премиум; canceled/unpaid → не", () => {
  assert.equal(premiumFromStripe("active"), true);
  assert.equal(premiumFromStripe("trialing"), true);
  assert.equal(premiumFromStripe("canceled"), false);
  assert.equal(premiumFromStripe("unpaid"), false);
  assert.equal(premiumFromStripe("past_due"), false);
  assert.equal(premiumFromStripe("incomplete"), false);
});

test("premiumFromStripe: неизвестен статус не дава премиум (fail-safe)", () => {
  // Ако Stripe добави нов статус, по подразбиране НЕ даваме достъп.
  assert.equal(premiumFromStripe("something_new" as unknown as StripeSubStatus), false);
});

test("billingStatusLabel: човешки етикет на български за всеки статус", () => {
  assert.equal(billingStatusLabel("NONE"), "Без абонамент");
  assert.equal(billingStatusLabel("ACTIVE"), "Активен");
  assert.equal(billingStatusLabel("TRIALING"), "Пробен период");
  assert.equal(billingStatusLabel("PAST_DUE"), "Просрочено плащане");
  assert.equal(billingStatusLabel("CANCELED"), "Прекратен");
  assert.equal(billingStatusLabel("UNPAID"), "Неплатен");
  assert.equal(billingStatusLabel("INCOMPLETE"), "Незавършен");
});
