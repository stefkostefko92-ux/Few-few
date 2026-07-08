import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  pickAppTarget,
  pickMusicTarget,
  type BlockMeta,
} from '@/lib/blocks';

// Клик по блок: записваме събитието (без бисквитки и лични данни)
// и пренасочваме към целта. „Умните“ блокове избират целта тук:
// APP по User-Agent (iOS/Android), MUSIC по ?svc=spotify|apple.
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

  const meta = (link.meta ?? null) as BlockMeta | null;
  let target: string | null;
  switch (link.kind) {
    case 'APP':
      target = pickAppTarget(
        request.headers.get('user-agent'),
        meta,
        link.url,
      );
      break;
    case 'MUSIC':
      target = pickMusicTarget(url.searchParams.get('svc'), meta, link.url);
      break;
    default:
      target = link.url;
  }
  if (!target) {
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

  return NextResponse.redirect(target, 302);
}

function hostOf(referer: string | null): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).host;
  } catch {
    return undefined;
  }
}
