import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bump, isBot, normalizePath } from "@/lib/stats";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { parseShortCode, qrRedirectLocation, safeInternalTarget, targetPath } from "@/lib/qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Кратък адрес от QR код по място: /p/<код> → вътрешна страница + ?s=qr-<код>.
// Така всеки плакат (аптека, поща, спирка…) се мери отделно, а броят е само
// агрегатен (ден, страница, код) — без IP, без бисквитка, без идентификатор.
//
// Пренасочва САМО към вътрешен път (виж safeInternalTarget). Непознат,
// неактивен или невалиден код → към началната. Адресите не се индексират.

type Ctx = { params: Promise<{ code: string }> };

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      // Относителен адрес — не може да изведе човека извън сайта.
      Location: location,
      // Всяко сканиране да стига до сървъра (кешът би „изял“ броенето).
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

async function resolve(raw: string): Promise<{ code: string; target: string } | null> {
  const code = parseShortCode(raw);
  if (!code) return null;
  try {
    const link = await prisma.shortLink.findFirst({
      where: { code: { equals: code, mode: "insensitive" }, published: true },
      select: { target: true },
    });
    return link ? { code, target: safeInternalTarget(link.target) } : null;
  } catch {
    // Без база — пак водим човека към сайта, не към грешка.
    return null;
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { code: raw } = await params;
  const link = await resolve(raw);
  if (!link) return redirect("/");

  // Броим само хора: без ботове и визуализатори на връзки (Viber/Facebook
  // правят преглед на адреса), без предварително зареждане и с таван срещу
  // изкуствено надуване. Таванът е широк — зад един адрес стоят много хора.
  const prefetch =
    req.headers.get("purpose") === "prefetch" ||
    req.headers.get("sec-purpose")?.includes("prefetch") === true;
  if (
    !prefetch &&
    !isBot(req.headers.get("user-agent")) &&
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
