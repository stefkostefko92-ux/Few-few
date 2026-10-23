import { handleLettura } from '@/server/schizzi/lettura';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The automatic reading of a survey sketch (round 50): the proposal of the measures, confirmed by the technician in
// the form. The checks, the limits and the answers: src/server/schizzi/lettura.ts.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; allegatoId: string }> }): Promise<Response> {
  const { id, allegatoId } = await params;
  return handleLettura(req, id, allegatoId);
}
