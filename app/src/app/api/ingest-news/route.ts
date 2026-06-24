import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { ingestMunicipalityNews } from "@/lib/ingest-news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Сравнение в постоянно време, за да не изтича информация по таймингите.
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Защитен адрес за автоматично внасяне по график (cron) на VPS-а.
// Предпочитан начин (токенът НЕ влиза в логовете на сървъра):
//   curl -H "Authorization: Bearer ТАЙНА" https://.../api/ingest-news
// Поддържа се и ?token= за съвместимост, но header-ът е по-сигурен.
// Новините се внасят като ЧЕРНОВИ — публикуването остава ръчно.
async function handle(req: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Неоторизиран достъп" }, { status: 401 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const provided = bearer || new URL(req.url).searchParams.get("token") || "";
  if (!provided || !safeEqual(provided, token)) {
    return NextResponse.json({ error: "Неоторизиран достъп" }, { status: 401 });
  }
  const result = await ingestMunicipalityNews(15);
  return NextResponse.json(result);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
