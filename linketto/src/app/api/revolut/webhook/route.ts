import { NextResponse } from 'next/server';
import { setting } from '@/lib/settings';
import { alertAtThreshold, countRecent, recordSecurityEvent } from '@/lib/security-events';
import { clientIpKey, rateLimit } from '@/lib/rate-limit';
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
  const secret = await setting('revolut.webhookSecret');
  if (!secret) return NextResponse.json({ error: 'disabled' }, { status: 503 });

  const rawBody = await request.text();
  const ok = verifyRevolutSignature({
    rawBody,
    timestamp: request.headers.get('revolut-request-timestamp') ?? '',
    signature: request.headers.get('revolut-signature') ?? '',
    secret,
    now: Date.now(),
  });
  if (!ok) {
    // Детекция (син екип D6): грешен подпис = подправен уебхук или сменена тайна.
    // Записът е само под лимит (по IP /64 и общо) — иначе анонимен флуд пълни
    // дневника и управлява алармите (Кодаджията M2).
    if (rateLimit(`webhook-bad:${await clientIpKey()}`, 10, 60 * 60_000) && rateLimit('webhook-bad:global', 100, 60 * 60_000)) {
      await recordSecurityEvent('webhook.bad_signature', { meta: { provider: 'revolut' } });
      await alertAtThreshold({ name: 'webhook-bad-signature', key: 'revolut', threshold: 3 }, await countRecent('webhook.bad_signature', 60), 'Revolut уебхук с грешен подпис', [
        '3+ заявки към /api/revolut/webhook с невалиден подпис за 1 час.',
        'Възможно: подправени заявки или сменена тайна на уебхука в Revolut.',
      ]);
    }
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

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
