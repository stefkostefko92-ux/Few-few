import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sofiaDay } from "@/lib/stats";
import { addDays, ymd } from "@/lib/analytics-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CSV само с агрегати (ден, метрика, път, източник, брой) за последните 90
// дни — за седмичния отчет без ръчни сметки. Само за администратор.
// В DailyStat няма лични данни, затова и във файла няма.

function cell(v: string | number): string {
  const s = String(v);
  // Защита от „CSV инжекция“ в Excel (=, +, -, @ в началото).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return new Response("Нямате достъп.", { status: 403 });

  const from = addDays(sofiaDay(), -89);
  const rows = await prisma.dailyStat.findMany({
    where: { day: { gte: from } },
    orderBy: [{ day: "asc" }, { metric: "asc" }, { count: "desc" }],
    select: { day: true, metric: true, path: true, source: true, count: true },
    take: 200_000,
  });
  const lines = ["day,metric,path,source,count"];
  for (const r of rows) {
    lines.push([ymd(r.day), r.metric, r.path, r.source, r.count].map(cell).join(","));
  }
  return new Response("﻿" + lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zabobovdol-statistika-${ymd(sofiaDay())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
