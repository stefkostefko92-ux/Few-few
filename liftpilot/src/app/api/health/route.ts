import { prisma } from '@/lib/db';
import { ENGINE_VERSION } from '@/calc/snapshot';
import { PROFILO } from '@/calc/norme';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Liveness with the database: a running process with a dead database is not healthy. The app name lets the deploy
// script check that it is really LiftPilot answering on the port.
export async function GET(): Promise<Response> {
  const body = { app: 'liftpilot', engine: ENGINE_VERSION, profile: PROFILO.id };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', ...body, db: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'error', ...body, db: 'down' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
