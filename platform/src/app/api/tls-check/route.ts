import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { subdomainOf, isPlatformHost } from "@/lib/domains";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// „Ask" endpoint за Caddy On-Demand TLS: Caddy пита преди да издаде сертификат
// за домейн от ръкостискането. Връщаме 200 само за домейни, които наистина
// обслужваме (наш поддомейн, или потвърден собствен домейн на публикуван сайт).
//   caddy: on_demand_tls { ask https://platform…/api/tls-check }
export async function GET(req: NextRequest) {
  // Публичен ask endpoint → лимит по IP срещу заливане на базата (последната
  // стойност е добавената от доверения proxy/Caddy).
  const ip = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
  if (!rateLimit(`tls:${ip}`, 60, 60_000)) {
    return new NextResponse("slow down", { status: 429 });
  }

  const domain = req.nextUrl.searchParams.get("domain")?.trim().toLowerCase() ?? "";
  if (!domain) return new NextResponse("no domain", { status: 400 });

  // Платформените хостове винаги са позволени.
  if (isPlatformHost(domain)) return new NextResponse("ok", { status: 200 });

  const sub = subdomainOf(domain);
  if (sub) {
    const s = await prisma.site.findFirst({
      where: { subdomain: sub, published: true },
      select: { id: true },
    });
    return new NextResponse(s ? "ok" : "no", { status: s ? 200 : 403 });
  }

  const s = await prisma.site.findFirst({
    where: { customDomain: domain, domainVerified: true, published: true },
    select: { id: true },
  });
  return new NextResponse(s ? "ok" : "no", { status: s ? 200 : 403 });
}
