import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Health probe за деплой/мониторинг — проверява и връзката с базата.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'up' });
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'down' }, { status: 503 });
  }
}
