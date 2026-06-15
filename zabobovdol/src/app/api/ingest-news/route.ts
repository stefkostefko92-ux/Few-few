import { NextResponse } from "next/server";
import { ingestMunicipalityNews } from "@/lib/ingest-news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Защитен адрес за автоматично внасяне по график (cron) на VPS-а.
// Извиква се напр.: curl "https://zabobovdol.carbonstealth.eu/api/ingest-news?token=ТАЙНА"
// Новините се внасят като ЧЕРНОВИ — публикуването остава ръчно.
export async function GET(req: Request) {
  const token = process.env.INGEST_TOKEN;
  const provided = new URL(req.url).searchParams.get("token");
  if (!token || provided !== token) {
    return NextResponse.json({ error: "Неоторизиран достъп" }, { status: 401 });
  }
  const result = await ingestMunicipalityNews(15);
  return NextResponse.json(result);
}
