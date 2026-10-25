import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Health probe за деплоя (autodeploy.sh го чака зелен преди да пусне трафик). */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' });
  } catch {
    // Без подробности навън — вътрешната грешка не е публична информация.
    return NextResponse.json({ status: 'degraded' }, { status: 503 });
  }
}
