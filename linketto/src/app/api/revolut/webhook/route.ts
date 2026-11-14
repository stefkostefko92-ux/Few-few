import { NextResponse } from 'next/server';
import { verifyRevolutSignature } from '@/lib/revolut-core';
import { settlePlanOrder, settlePlanRefund } from '@/lib/plan-order-service';
import { prisma } from '@/lib/db';

// Уебхук на Revolut Merchant (spec §7.1 P3–P5). Подписът се проверява върху
// СУРОВОТО тяло; събитието носи само `order_id`, затова състоянието се чете от
// API-то (settlePlanOrder). Refund поръчките (type refund) също пращат събития
// по своето id → settlePlanRefund. Revolut ретрайва само при 4XX/таймаут (3 пъти
// през 10 мин.) — при вътрешна грешка връщаме 409; изпуснатото хваща
// /api/cron/plans (P9). Refund/спор, пуснати от таблото на Revolut, НЕ се
// синхронизират — връщането се прави само от /admin (DEPLOY §4).

const ORDER_EVENTS = new Set([
  'ORDER_COMPLETED',
  'ORDER_AUTHORISED',
  'ORDER_FAILED',
  'ORDER_CANCELLED',
  'ORDER_PAYMENT_FAILED',
  'ORDER_PAYMENT_DECLINED',
]);

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.REVOLUT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'disabled' }, { status: 503 });

  const rawBody = await request.text();
  const ok = verifyRevolutSignature({
    rawBody,
    timestamp: request.headers.get('revolut-request-timestamp') ?? '',
    signature: request.headers.get('revolut-signature') ?? '',
    secret,
    now: Date.now(),
  });
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  let event: { event?: unknown; order_id?: unknown };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (typeof event.event !== 'string' || !ORDER_EVENTS.has(event.event) || typeof event.order_id !== 'string') {
    // Събития извън поръчките (спорове, изплащания) не носят права тук.
    return new NextResponse(null, { status: 204 });
  }
  try {
    const isRefund = await prisma.planOrder.findUnique({
      where: { refundOrderId: event.order_id },
      select: { id: true },
    });
    if (isRefund) await settlePlanRefund({ refundOrderId: event.order_id });
    else await settlePlanOrder({ revolutOrderId: event.order_id });
  } catch (error) {
    console.error('[revolut-webhook] settle failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'retry' }, { status: 409 });
  }
  return new NextResponse(null, { status: 204 });
}
