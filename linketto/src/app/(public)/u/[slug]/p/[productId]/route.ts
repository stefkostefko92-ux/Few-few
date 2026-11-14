import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { countryOf, localeOf } from '@/lib/analytics';
import { isExternalPaymentUrl } from '@/lib/external-url';
import { maybePurgeOldClicks } from '@/lib/retention';

// Клик по продукт → към линка за плащане на създателя (решение О-1). Записваме
// само анонимно събитие (без бисквитки, IP и user agent — както при блоковете),
// за да вижда създателят интереса към продуктите си. HEAD не се брои
// (link checker-и и unfurler-и).
type Ctx = { params: Promise<{ slug: string; productId: string }> };

export function GET(request: Request, ctx: Ctx): Promise<NextResponse> {
  return handle(request, ctx, true);
}

export function HEAD(request: Request, ctx: Ctx): Promise<NextResponse> {
  return handle(request, ctx, false);
}

function hostOf(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).hostname.slice(0, 120) || null;
  } catch {
    return null;
  }
}

async function handle(request: Request, { params }: Ctx, record: boolean): Promise<NextResponse> {
  const { slug, productId } = await params;
  const url = new URL(request.url);
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      active: true,
      externalUrl: { not: null },
      profile: { slug, published: true, bannedAt: null },
    },
    select: { id: true, profileId: true, externalUrl: true },
  });
  // Повторна проверка на целта (защита в дълбочина: само https, без вход в URL).
  if (!product?.externalUrl || !isExternalPaymentUrl(product.externalUrl)) {
    return NextResponse.redirect(new URL(`/u/${encodeURIComponent(slug)}`, url.origin), 302);
  }
  if (record) {
    void maybePurgeOldClicks();
    await prisma.clickEvent
      .create({
        data: {
          profileId: product.profileId,
          productId: product.id,
          locale: localeOf(url.searchParams.get('hl')),
          referrerHost: hostOf(request.headers.get('referer')),
          country: countryOf(request.headers.get('cf-ipcountry')),
        },
      })
      .catch(() => undefined);
  }
  return NextResponse.redirect(product.externalUrl, 302);
}
