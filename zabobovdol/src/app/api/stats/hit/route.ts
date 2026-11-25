import { z } from "zod";
import { bump, normalizePath, normalizeSource } from "@/lib/stats";
import { constantTimeEqual, groupPath, hitKey, HIT_HEADER } from "@/lib/analytics-core";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ВЪТРЕШЕН адрес: вика го само middleware (src/middleware.ts) при истински
// преглед на страница. Отвън е безполезен — без ключа (HMAC от AUTH_SECRET)
// връща 404, така че никой не може да „надува“ статистиката през него.
//
// Пази се САМО: ден, нормализиран път, източник и брой. IP-то (ако е
// подадено) служи единствено за лимита в паметта и не се записва никъде.

const Body = z.object({
  p: z.string().max(2048),
  s: z.string().max(100).optional().default(""),
  r: z.string().max(2048).optional().default(""),
  h: z.string().max(255).optional().default(""),
});

let expected: Promise<string | null> | null = null;

function siteHost(): string {
  try {
    return new URL(SITE.url).hostname.toLowerCase();
  } catch {
    return SITE.domain;
  }
}

/** Източникът на прегледа; препращане от собствения домейн = вътрешно. */
function viewSource(s: string, referrer: string, host: string): string {
  // Собственият домейн (подаденият хост или каноничният) → „internal“.
  const src = normalizeSource(s, referrer, host);
  if (src === "other-site" && normalizeSource(s, referrer, siteHost()) === "internal") return "internal";
  return src;
}

export async function POST(req: Request) {
  expected ??= hitKey(process.env.AUTH_SECRET);
  const key = await expected;
  const given = req.headers.get(HIT_HEADER) ?? "";
  if (!key || !given || !constantTimeEqual(given, key)) {
    return new Response(null, { status: 404 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    const raw = await req.text();
    if (raw.length > 6000) return new Response(null, { status: 413 });
    parsed = Body.parse(JSON.parse(raw));
  } catch {
    return new Response(null, { status: 400 });
  }

  // Широк таван срещу скриптово надуване: зад един адрес (читалище, кметство,
  // мобилен оператор) стоят много хора. Над тавана просто не броим.
  if (!rateLimit(await clientKey("view"), 300, 10 * 60 * 1000)) {
    return new Response(null, { status: 204 });
  }

  const path = groupPath(normalizePath(parsed.p));
  const source = viewSource(parsed.s, parsed.r, parsed.h);
  await bump("view", path, source);
  // Отворено от иконата на началния екран (manifest start_url = /?s=app).
  if (source === "app") await bump("app_open", path, "app");
  return new Response(null, { status: 204 });
}
