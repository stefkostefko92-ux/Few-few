import { handleUpload } from '@/server/allegati/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A file uploaded for an installation (round 49): every check and the storing are in src/server/allegati/upload.ts; the
// body is read there with a byte counter (nginx lets 21 MiB through on this path only, deploy/nginx/liftpilot.conf).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleUpload(req, (await params).id);
}
