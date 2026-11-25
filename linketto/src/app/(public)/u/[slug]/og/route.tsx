import { NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { prisma } from '@/lib/db';
import { parseStyle } from '@/lib/style';
import { avatarDataUrl, ogFonts } from '@/lib/og-image';
import { clampText, hexToRgba, initialsOf, ogSafeText } from '@/lib/og-text';
import { profileUrl } from '@/lib/profile-url';

// Social карта 1200×630 за всеки профил: аватар (или монограм), име, био
// на гледания език, езиците на профила и краткият линк. Всяко споделяне в
// WhatsApp/Telegram/X/LinkedIn става реклама на създателя — и на нас.
// Без външни заявки: шрифтът е от диска, аватарът е само наш /media файл.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const hl = new URL(request.url).searchParams.get('hl') ?? '';
  const profile = await prisma.profile.findUnique({
    where: { slug },
    select: {
      published: true,
      bannedAt: true,
      accent: true,
      style: true,
      defaultLocale: true,
      translations: { select: { locale: true, displayName: true, bio: true } },
    },
  });
  if (
    !profile ||
    !profile.published ||
    profile.bannedAt ||
    profile.translations.length === 0
  ) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const main =
    profile.translations.find((t) => t.locale === hl) ??
    profile.translations.find((t) => t.locale === profile.defaultLocale) ??
    profile.translations[0];
  const name = clampText(ogSafeText(main.displayName) || slug, 40);
  const bio = clampText(ogSafeText(main.bio ?? ''), 150);
  const accent = profile.accent ?? '#3b82c4';
  const style = parseStyle(profile.style);
  const [fonts, avatar] = await Promise.all([
    ogFonts(),
    avatarDataUrl(style.avatarUrl),
  ]);
  const locales = profile.translations.map((t) => t.locale.toUpperCase());
  const shownLocales = locales.slice(0, 7);
  const shortUrl = profileUrl(slug).replace(/^https?:\/\//, '');

  const image = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '64px 80px',
          color: '#ffffff',
          fontFamily: 'Inter',
          backgroundColor: '#070b16',
          backgroundImage: `radial-gradient(circle at 16% 24%, ${hexToRgba(accent, 0.55)}, rgba(7, 11, 22, 0) 52%), radial-gradient(circle at 92% 96%, ${hexToRgba(accent, 0.32)}, rgba(7, 11, 22, 0) 46%)`,
        }}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- satori рендира <img>, не next/image
          <img
            src={avatar}
            width={280}
            height={280}
            alt=""
            style={{
              borderRadius: 9999,
              border: `6px solid ${hexToRgba(accent, 0.9)}`,
              boxShadow: `0 0 80px ${hexToRgba(accent, 0.55)}`,
            }}
          />
        ) : (
          <div
            style={{
              width: 280,
              height: 280,
              borderRadius: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 112,
              fontWeight: 600,
              backgroundImage: `linear-gradient(135deg, ${hexToRgba(accent, 1)}, ${hexToRgba(accent, 0.45)})`,
              boxShadow: `0 0 80px ${hexToRgba(accent, 0.55)}`,
            }}
          >
            {initialsOf(name) || 'L'}
          </div>
        )}

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            marginLeft: 64,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: name.length > 24 ? 56 : 72,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
            }}
          >
            {name}
          </div>
          {bio && (
            <div
              style={{
                display: 'flex',
                marginTop: 22,
                fontSize: 30,
                lineHeight: 1.35,
                color: 'rgba(255, 255, 255, 0.78)',
              }}
            >
              {bio}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 34 }}>
            {shownLocales.map((code) => (
              <div
                key={code}
                style={{
                  display: 'flex',
                  marginRight: 10,
                  marginBottom: 10,
                  padding: '6px 14px',
                  borderRadius: 9999,
                  fontSize: 22,
                  fontWeight: 600,
                  border: '2px solid rgba(255, 255, 255, 0.28)',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                }}
              >
                {code}
              </div>
            ))}
            {locales.length > shownLocales.length && (
              <div
                style={{
                  display: 'flex',
                  padding: '6px 14px',
                  fontSize: 22,
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.7)',
                }}
              >
                +{locales.length - shownLocales.length}
              </div>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 18,
              fontSize: 28,
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.92)',
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                marginRight: 14,
                borderRadius: 9999,
                backgroundColor: hexToRgba(accent, 1),
                boxShadow: `0 0 18px ${hexToRgba(accent, 0.9)}`,
              }}
            />
            {shortUrl}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 40,
            right: 56,
            display: 'flex',
            padding: '8px 18px',
            borderRadius: 9999,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '0.18em',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            color: 'rgba(255, 255, 255, 0.85)',
          }}
        >
          LINKETTO
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  );
  // PNG с градиенти е ~350 KB — над ~300 KB, които WhatsApp приема за
  // преглед. JPEG (mozjpeg) е ~10 пъти по-лек при същия вид.
  const jpeg = await sharp(Buffer.from(await image.arrayBuffer()))
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
