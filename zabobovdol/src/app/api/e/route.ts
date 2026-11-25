import { z } from "zod";
import { bump, isBot, normalizePath, normalizeSource } from "@/lib/stats";
import { isEventName } from "@/lib/events";
import { groupPath } from "@/lib/analytics-core";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Приема събитие от браузъра (track() в src/lib/events.ts, през sendBeacon):
//   { e: <име от EVENT_NAMES>, p: <път на страницата>, s: <маркер ?s=…> }
// Пази се САМО брой на ден × събитие × път × източник (DailyStat). Никакъв
// IP адрес, user agent, бисквитка или идентификатор не се записва — IP-то
// служи само за лимита в паметта. Неизвестно събитие → 400 (затворен списък).

const Body = z
  .object({
    e: z.string().max(40).refine(isEventName, "Непознато събитие"),
    p: z.string().max(2048).optional().default("/"),
    s: z.string().max(100).optional().default(""),
  })
  .strict(); // излишни полета → отказ (ботове, чужди скриптове)

function ownHosts(req: Request): string[] {
  const hosts = new Set<string>();
  const h = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  if (h) hosts.add(h.split(":")[0]);
  try {
    hosts.add(new URL(SITE.url).hostname.toLowerCase());
  } catch {
    hosts.add(SITE.domain);
  }
  return [...hosts];
}

export async function POST(req: Request) {
  // Само от нашите страници: чужд сайт не може да брои от наше име.
  const origin = req.headers.get("origin");
  if (origin) {
    let host = "";
    try {
      host = new URL(origin).hostname.toLowerCase();
    } catch {
      return new Response(null, { status: 403 });
    }
    if (!ownHosts(req).includes(host)) return new Response(null, { status: 403 });
  }

  // Ботовете не са хора — приемаме тихо, но не броим.
  if (isBot(req.headers.get("user-agent"))) return new Response(null, { status: 204 });

  // Широк таван (зад един адрес стоят много хора) — реже само надуване.
  if (!rateLimit(await clientKey("e"), 120, 10 * 60 * 1000)) {
    return new Response(null, { status: 429 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    // sendBeacon праща Blob; четем като текст, независимо от content-type.
    const raw = await req.text();
    if (raw.length > 4096) return new Response(null, { status: 413 });
    const r = Body.safeParse(JSON.parse(raw));
    if (!r.success) return new Response(null, { status: 400 });
    parsed = r.data;
  } catch {
    return new Response(null, { status: 400 });
  }

  const [host] = ownHosts(req);
  const path = groupPath(normalizePath(parsed.p));
  // Собственият домейн → „internal“, непознат → „other-site“ (без името му) —
  // решава normalizeSource.
  const source = normalizeSource(parsed.s, req.headers.get("referer"), host);
  await bump(parsed.e, path, source);
  return new Response(null, { status: 204 });
}
