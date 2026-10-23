import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { notifyTopic } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Днешна дата в Европа/София като YYYY-MM-DD.
function sofiaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia" }).format(new Date());
}

// За cron в 08:00: праща темата „Дежурна аптека“ с днешното дежурство от
// графика. Няма запис за днес → нищо не се праща. Токенът е в заглавието.
//   curl -X POST -H "Authorization: Bearer ТАЙНА" https://…/api/push/daily
export async function POST(req: Request) {
  const token = process.env.INGEST_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || !provided || !safeEqual(provided, token)) {
    return NextResponse.json({ error: "Неоторизиран достъп" }, { status: 401 });
  }
  const day = new Date(`${sofiaToday()}T00:00:00.000Z`);
  const duty = await prisma.dutyRoster.findFirst({
    where: { date: day, published: true },
    orderBy: { createdAt: "asc" },
  });
  if (!duty) return NextResponse.json({ sent: 0, reason: "няма дежурство за днес" });
  const parts = [duty.address, duty.hours ? `работно време ${duty.hours}` : ""].filter(Boolean);
  const r = await notifyTopic("pharmacy", {
    title: `Дежурна аптека днес: ${duty.pharmacy}`,
    body: parts.join(", ") || "Вижте подробностите на сайта.",
    url: "/dezhurna-apteka?s=push",
  });
  return NextResponse.json(r);
}
