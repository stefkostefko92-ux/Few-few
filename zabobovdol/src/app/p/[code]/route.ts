import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bump, normalizePath } from "@/lib/stats";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import {
  isHumanScan,
  qrRedirectLocation,
  resolveShortLink,
  shortLinkRedirectHeaders,
  shortLinkWhere,
  targetPath,
} from "@/lib/qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Кратък адрес от QR код по място: /p/<код> → вътрешна страница + ?s=qr-<код>.
// Така всеки плакат (аптека, поща, спирка…) се мери отделно, а броят е само
// агрегатен (ден, страница, код) — без IP, без бисквитка, без идентификатор.
//
// Пренасочва САМО към вътрешен път (виж safeInternalTarget). Непознат,
// неактивен или невалиден код → към началната. Адресите не се индексират.
// Логиката е в @/lib/qr (чиста — тества се); тук е само връзката с базата.

type Ctx = { params: Promise<{ code: string }> };

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: shortLinkRedirectHeaders(location) });
}

function resolve(raw: string) {
  return resolveShortLink(raw, (code) =>
    prisma.shortLink.findFirst({ where: shortLinkWhere(code), select: { target: true } }),
  );
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { code: raw } = await params;
  const link = await resolve(raw);
  if (!link) return redirect("/");

  // Броим само хора (виж isHumanScan) и с таван срещу изкуствено надуване.
  // Таванът е широк — зад един адрес стоят много хора.
  if (
    isHumanScan((n) => req.headers.get(n)) &&
    rateLimit(await clientKey("qr"), 30, 10 * 60 * 1000)
  ) {
    await bump("qr", normalizePath(targetPath(link.target)), `qr-${link.code}`);
  }

  return redirect(qrRedirectLocation(link.target, link.code));
}

// HEAD (проверки на връзки) — същото пренасочване, но без броене.
export async function HEAD(_req: NextRequest, { params }: Ctx) {
  const { code: raw } = await params;
  const link = await resolve(raw);
  return redirect(link ? qrRedirectLocation(link.target, link.code) : "/");
}
