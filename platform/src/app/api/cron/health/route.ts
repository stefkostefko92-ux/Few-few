import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runHealthCheck } from "@/lib/sites";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Сравнение с постоянно време (избягва timing по токена).
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Периодична здравна проверка на всички активни сайтове.
// Само POST и само със секрет в заглавие (не в URL, за да не влиза в логове):
//   curl -X POST -H "Authorization: Bearer ТАЙНА" https://.../api/cron/health
export async function POST(req: NextRequest) {
  const token = process.env.CRON_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "CRON_TOKEN не е зададен." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${token}`)) {
    return NextResponse.json({ error: "Неоторизиран." }, { status: 401 });
  }

  const sites = await prisma.site.findMany({ where: { monitorEnabled: true } });
  const results = await Promise.all(
    sites.map(async (site) => {
      const r = await runHealthCheck(site);
      return { slug: site.slug, ok: r.ok, statusCode: r.statusCode };
    }),
  );
  const down = results.filter((r) => !r.ok).length;
  await logAudit(null, {
    action: "CHECK",
    entity: "Site",
    summary: `Периодична проверка: ${results.length} сайта, ${down} с проблем`,
  });

  return NextResponse.json({ checked: results.length, down, results });
}
