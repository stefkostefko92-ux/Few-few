import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { purgeExpiredSearchMisses, SEARCH_MISS_RETENTION_DAYS } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Защитен адрес за чистене по срок (cron на VPS-а), със същия INGEST_TOKEN:
//   curl -X POST -H "Authorization: Bearer ТАЙНА" https://.../api/retention
// Само в заглавката — токенът не бива да попада в логовете през адреса.
export async function POST(req: Request) {
  const token = process.env.INGEST_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || !bearer || !safeEqual(bearer, token)) {
    return NextResponse.json({ error: "Неоторизиран достъп" }, { status: 401 });
  }
  try {
    const deleted = await purgeExpiredSearchMisses();
    return NextResponse.json({
      ok: true,
      searchMissDeleted: deleted,
      searchMissRetentionDays: SEARCH_MISS_RETENTION_DAYS,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
