import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Health check за мониторинг/uptime probe — проверява и връзката с базата.
// `app` е маркер за идентичност: на споделен VPS само „200“ не доказва КОЙ
// отговаря на порта (деплой сондата в deploy/autodeploy.sh търси точно него).
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'up', app: 'linketto' });
  } catch {
    return NextResponse.json(
      { status: 'degraded', db: 'down', app: 'linketto' },
      { status: 503 },
    );
  }
}
