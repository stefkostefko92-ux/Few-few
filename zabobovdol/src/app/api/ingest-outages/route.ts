import { NextResponse } from "next/server";
import { ingestErmOutages } from "@/lib/ingest-outages";
import { bearerMatches, isIngestEnabled } from "@/lib/ingest-outages-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Защитен адрес за автоматичен внос на прекъсванията на тока от ЕРМ Запад
// (cron на VPS-а). Само POST и само с header (токенът не влиза в логовете):
//   curl -fsS -X POST -H "Authorization: Bearer ТАЙНА" https://.../api/ingest-outages
// ИЗКЛЮЧЕН по подразбиране — работи само при ERM_INGEST_ENABLED=1, след като
// собственикът провери условията за ползване на данните (docs/outages-ingest.md).
export async function POST(req: Request) {
  // Първо достъпът — иначе непознат би разбрал дали вносът е включен.
  if (!bearerMatches(req.headers.get("authorization"), process.env.INGEST_TOKEN)) {
    return NextResponse.json({ error: "Неоторизиран достъп" }, { status: 401 });
  }
  if (!isIngestEnabled(process.env.ERM_INGEST_ENABLED)) {
    return NextResponse.json(
      {
        ok: false,
        enabled: false,
        error:
          "Вносът от ЕРМ Запад е изключен. Включва се с ERM_INGEST_ENABLED=1 след проверка на условията за ползване.",
      },
      { status: 503 },
    );
  }
  const result = await ingestErmOutages();
  // 502 при грешка от източника — `curl -f` в cron-а я показва в лога.
  const status = result.ok || result.skipped ? 200 : 502;
  return NextResponse.json(result, { status, headers: { "cache-control": "no-store" } });
}

export function GET() {
  return NextResponse.json(
    { error: "Само POST с Authorization: Bearer." },
    { status: 405, headers: { allow: "POST" } },
  );
}
