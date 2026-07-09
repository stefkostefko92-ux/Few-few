import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadsDir } from '@/lib/media';

// Сервира качените изображения. Стриктен allowlist на имената —
// никакъв path traversal.
const NAME_RE = /^[a-z0-9-]+\.webp$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<NextResponse> {
  const { file } = await params;
  if (!NAME_RE.test(file)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  try {
    const data = await readFile(path.join(uploadsDir(), file));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
