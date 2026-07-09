import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/db';

// Безплатен QR код на профила (Linktree го дава само срещу пари) —
// SVG в акцентния цвят, готов за печат върху визитка или стикер.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const profile = await prisma.profile.findUnique({
    where: { slug },
    select: { published: true, accent: true, bannedAt: true },
  });
  if (!profile || !profile.published || profile.bannedAt) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const base = process.env.PUBLIC_BASE_URL ?? new URL(request.url).origin;
  const svg = await QRCode.toString(`${base}/u/${slug}`, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: {
      dark: profile.accent ?? '#1d3d5c',
      light: '#ffffff00',
    },
  });
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
