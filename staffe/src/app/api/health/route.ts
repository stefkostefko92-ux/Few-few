import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Sonda per il deploy e per il monitoraggio. Verifica anche il database:
 * un processo vivo con la base dati irraggiungibile non è «sano», e il
 * rollback automatico deve accorgersene.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ stato: 'ok', database: 'ok' });
  } catch {
    return NextResponse.json(
      { stato: 'degradato', database: 'irraggiungibile' },
      { status: 503 },
    );
  }
}
