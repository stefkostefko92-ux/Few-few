import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, webhookSecret } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/billing-server";

// Винаги динамичен; никакво кеширане на webhook.
export const dynamic = "force-dynamic";
// Спираме автоматичното парсване — нужно е СУРОВОТО тяло за проверка на подписа.
export const runtime = "nodejs";

// Проверен Stripe webhook. Достъпът до премиум се дава ТУК (не в success_url),
// идемпотентно по event.id. Проверяваме подписа със суровото тяло — парсване
// преди проверката би счупило подписа.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = webhookSecret();
  if (!stripe || !secret) {
    // Билингът не е конфигуриран — не приемаме webhook-и.
    return NextResponse.json({ error: "Билингът не е настроен." }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Липсва подпис." }, { status: 400 });
  }

  // СУРОВОТО тяло (текст), точно както е изпратено — без JSON.parse преди проверка.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    // Невалиден/изтекъл подпис → 400, за да не даваме достъп на подправен payload.
    console.error("Stripe webhook: неуспешна проверка на подписа", err);
    return NextResponse.json({ error: "Невалиден подпис." }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // 500 → Stripe ще ретрайне; обработката е идемпотентна, така че ретраят е безопасен.
    console.error(`Stripe webhook: грешка при обработка на ${event.type}`, err);
    return NextResponse.json({ error: "Грешка при обработка." }, { status: 500 });
  }

  // Бърз 2xx — тежката работа вече е свършена синхронно и е малка.
  return NextResponse.json({ received: true });
}
