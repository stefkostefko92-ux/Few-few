import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runHealthCheck } from "@/lib/sites";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Периодична здравна проверка на всички активни сайтове.
// Пази се с таен токен: Authorization: Bearer <CRON_TOKEN>.
//   curl -H "Authorization: Bearer ТАЙНА" https://.../api/cron/health
export async function POST(req: NextRequest) {
  const token = process.env.CRON_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "CRON_TOKEN не е зададен." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${token}`) {
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

// Позволяваме и GET за лесно тестване с браузър/уеб-хук, който праща GET.
export const GET = POST;
