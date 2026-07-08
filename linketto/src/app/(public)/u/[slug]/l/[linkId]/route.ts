import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  buildVCard,
  isBlockVisible,
  pickAppTarget,
  pickMusicTarget,
  type BlockMeta,
} from '@/lib/blocks';
import { isSensitiveUrl } from '@/lib/brands';
import { isLocale } from '@/i18n/locales';

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

  // Чувствително (18+) съдържание: преходна страница за потвърждение
  // на възрастта, преди да пренасочим (както при Linktree).
  if (isSensitiveUrl(target) && url.searchParams.get('adult') !== '1') {
    return ageGateResponse(url, slug);
  }

  await recordClick();
  return NextResponse.redirect(target, 302);
}

async function ageGateResponse(
  url: URL,
  slug: string,
): Promise<NextResponse> {
  const hl = url.searchParams.get('hl') ?? '';
  const locale = isLocale(hl) ? hl : 'en';
  const messages = (await import(`@/../messages/${locale}.json`)).default as {
    profile: Record<string, string>;
  };
  const t = messages.profile;
  const confirmUrl = new URL(url);
  confirmUrl.searchParams.set('adult', '1');
  const backHref = `/u/${esc(slug)}${isLocale(hl) ? `?hl=${hl}` : ''}`;
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(t.adultTitle)}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(to bottom,#0f172a,#020617);color:#fff;
    font-family:ui-sans-serif,system-ui,sans-serif;padding:24px}
  .card{max-width:26rem;text-align:center;border:1px solid rgba(255,255,255,.15);
    background:rgba(255,255,255,.08);backdrop-filter:blur(16px);border-radius:24px;padding:40px 32px}
  .badge{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;
    border:2px solid #f87171;color:#f87171;border-radius:9999px;font-weight:800;font-size:18px;margin-bottom:16px}
  h1{font-size:20px;margin:0 0 8px}
  p{font-size:14px;line-height:1.6;opacity:.75;margin:0 0 24px}
  a{display:block;border-radius:9999px;padding:12px 24px;font-size:14px;font-weight:600;
    text-decoration:none;margin-top:10px}
  .confirm{background:#fff;color:#0f172a}
  .back{border:1px solid rgba(255,255,255,.3);color:#fff}
</style>
</head>
<body>
  <main class="card">
    <span class="badge">18+</span>
    <h1>${esc(t.adultTitle)}</h1>
    <p>${esc(t.adultBody)}</p>
    <a class="confirm" href="${esc(confirmUrl.pathname + confirmUrl.search)}" rel="nofollow">${esc(t.adultConfirm)}</a>
    <a class="back" href="${backHref}">${esc(t.adultBack)}</a>
  </main>
</body>
</html>`;
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hostOf(referer: string | null): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).host;
  } catch {
    return undefined;
  }
}
