import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { ANSWER } from '@/lib/answers';
import { archivedLanguages } from '@/lib/legal-archive';

export const runtime = 'nodejs';

// The text of an earlier version of the terms in English or Bulgarian, word for word as accepted while the interface
// had those languages (legal/terms/<version>/<en|bg>.txt): a record, not a page of the product, so plain text, never
// indexed. Linked from /<locale>/privacy/<version>. Nothing else is served: the Italian text is that page itself.
export async function GET(_req: Request, { params }: { params: Promise<{ version: string; lang: string }> }): Promise<Response> {
  const { version, lang } = await params;
  const file = archivedLanguages(version).find((a) => a.lang === lang)?.file;
  if (!file) return new NextResponse(ANSWER.notFound, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new NextResponse(await readFile(file, 'utf8'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Language': lang,
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
