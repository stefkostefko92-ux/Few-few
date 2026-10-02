import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The verification checklist for the engineer (generated from the registry, docs/), for signed-in users.
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || !can(user, 'projects:view')) return new Response('Unauthorized', { status: 401 });
  const file = await readFile(path.join(process.cwd(), 'docs', 'lista-verifica-normativa.xlsx'));
  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="lista-verifica-normativa.xlsx"',
      'Cache-Control': 'private, no-store',
    },
  });
}
