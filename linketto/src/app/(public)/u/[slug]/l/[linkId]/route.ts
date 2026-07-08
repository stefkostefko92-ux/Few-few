import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  buildVCard,
  isBlockVisible,
  pickAppTarget,
  pickMusicTarget,
  type BlockMeta,
} from '@/lib/blocks';

// Клик по блок: записваме събитието (без бисквитки и лични данни)
// и пренасочваме към целта. „Умните“ блокове избират целта тук:
// APP по User-Agent (iOS/Android), MUSIC по ?svc=spotify|apple,
// VCARD връща .vcf файл („Запази контакта“).
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
    include: { profile: { include: { translations: true } } },
  });
  if (!link || !isBlockVisible(link, new Date())) {
    return NextResponse.redirect(new URL(`/u/${slug}`, url.origin), 302);
  }

  const meta = (link.meta ?? null) as BlockMeta | null;

  const recordClick = () =>
    prisma.clickEvent
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

  if (link.kind === 'VCARD') {
    const profile = link.profile;
    const name =
      profile.translations.find((t) => t.locale === profile.defaultLocale)
        ?.displayName ??
      profile.translations[0]?.displayName ??
      slug;
    const base = process.env.PUBLIC_BASE_URL ?? url.origin;
    await recordClick();
    return new NextResponse(
      buildVCard({
        name,
        phone: meta?.phone,
        email: meta?.email,
        org: meta?.org,
        url: `${base}/u/${slug}`,
      }),
      {
        headers: {
          'Content-Type': 'text/vcard; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slug}.vcf"`,
        },
      },
    );
  }

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

  await recordClick();
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
