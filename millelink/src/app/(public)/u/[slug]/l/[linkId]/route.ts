import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Клик по линк: записваме събитието (без бисквитки и лични данни)
// и пренасочваме към целта.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; linkId: string }> },
): Promise<NextResponse> {
  const { slug, linkId } = await params;
  const url = new URL(request.url);

  const link = await prisma.link.findFirst({
    where: {
      id: linkId,
      active: true,
      profile: { slug, published: true },
    },
  });
  if (!link) {
    return NextResponse.redirect(new URL(`/u/${slug}`, url.origin), 302);
  }

  await prisma.clickEvent
    .create({
      data: {
        profileId: link.profileId,
        linkId: link.id,
        locale: url.searchParams.get('hl') ?? undefined,
        referrerHost: hostOf(request.headers.get('referer')),
        country: request.headers.get('cf-ipcountry') ?? undefined,
      },
    })
    .catch(() => undefined);

  return NextResponse.redirect(link.url, 302);
}

function hostOf(referer: string | null): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).host;
  } catch {
    return undefined;
  }
}
