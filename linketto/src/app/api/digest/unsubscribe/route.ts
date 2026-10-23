import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { digestUnsubscribeStrings, verifyDigestToken } from '@/lib/digest';

// Отписване от седмичния отчет с 1 клик, без вход. GET само показва бутон
// (пощенските скенери „отварят“ линковете — GET без странични ефекти);
// POST отписва — от формата или директно от пощенския клиент (RFC 8058).

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );

function page(locale: string, body: string): NextResponse {
  const s = digestUnsubscribeStrings(locale);
  return new NextResponse(
    `<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(s.title)} · Linketto</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px"><main style="max-width:420px;text-align:center"><p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#7dd3fc;font-weight:700">Linketto</p><h1 style="font-size:24px">${esc(s.title)}</h1>${body}</main></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}

async function resolve(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('u') ?? '';
  const token = url.searchParams.get('s') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret || !verifyDigestToken(userId, token, secret)) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, locale: true },
  });
  return user ? { user, userId, token } : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const found = await resolve(request);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const s = digestUnsubscribeStrings(found.user.locale);
  const action = `/api/digest/unsubscribe?u=${encodeURIComponent(found.userId)}&s=${found.token}`;
  return page(
    found.user.locale,
    `<form method="post" action="${esc(action)}"><button type="submit" style="margin-top:12px;background:#fff;color:#0f172a;border:0;border-radius:999px;padding:12px 24px;font-weight:600;font-size:16px;cursor:pointer">${esc(s.confirm)}</button></form>`,
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const found = await resolve(request);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await prisma.user.update({
    where: { id: found.user.id },
    data: { digestOptOut: true },
  });
  const s = digestUnsubscribeStrings(found.user.locale);
  return page(
    found.user.locale,
    `<p style="line-height:1.6;color:#cbd5e1">${esc(s.done)}</p>`,
  );
}
