import { NextResponse } from 'next/server';
import { verifyRevolutSignature, webhookEvent } from '@/lib/revolut-core';
import { recordDispute, settlePlanOrder, settlePlanRefund } from '@/lib/plan-order-service';
import { prisma } from '@/lib/db';

// Уебхук на Revolut Merchant (spec §7.1 P3–P5). Подписът се проверява върху
// СУРОВОТО тяло; събитието носи само `order_id`, затова състоянието се чете от
// API-то (settlePlanOrder). Refund поръчките (type refund) също пращат събития
// по своето id → settlePlanRefund. Споровете (`DISPUTE_*`, само `dispute_id`) →
// recordDispute: чете спора, записва го в одита и известява админите — без
// автоматично отнемане на плана. Revolut ретрайва само при 4XX/таймаут (3 пъти
// през 10 мин.) — при вътрешна или временна грешка връщаме 409; изпуснатата
// поръчка хваща /api/cron/plans (P9). Refund, пуснат от таблото на Revolut, НЕ
// се синхронизира — връщането се прави само от /admin (DEPLOY §4).

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

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const event = webhookEvent(body);
  // Други събития (изплащания и пр.) не носят нищо тук.
  if (!event) return new NextResponse(null, { status: 204 });
  try {
    if (event.kind === 'dispute') {
      await recordDispute(event.disputeId);
    } else {
      const isRefund = await prisma.planOrder.findUnique({
        where: { refundOrderId: event.orderId },
        select: { id: true },
      });
      if (isRefund) await settlePlanRefund({ refundOrderId: event.orderId });
      else await settlePlanOrder({ revolutOrderId: event.orderId });
    }
  } catch (error) {
    console.error('[revolut-webhook] settle failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'retry' }, { status: 409 });
  }
  return new NextResponse(null, { status: 204 });
}
