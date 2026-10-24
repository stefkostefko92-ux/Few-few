import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  BUSINESS_CONTACT_RETENTION_MONTHS,
  PHONE_REPORT_OPEN_MONTHS,
  PHONE_REPORT_RESOLVED_DAYS,
  purgeExpired,
  SEARCH_MISS_RETENTION_DAYS,
} from "@/lib/retention";

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
// Трие: търсения без резултат, сигнали за сгрешени номера и контактите от
// формата за бизнес — всяко по своя срок (src/lib/retention-core.ts).
export async function POST(req: Request) {
  const token = process.env.INGEST_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || !bearer || !safeEqual(bearer, token)) {
    return NextResponse.json({ error: "Неоторизиран достъп" }, { status: 401 });
  }
  try {
    const deleted = await purgeExpired();
    return NextResponse.json({
      ok: true,
      searchMissDeleted: deleted.searchMiss,
      searchMissRetentionDays: SEARCH_MISS_RETENTION_DAYS,
      phoneReportDeleted: deleted.phoneReport,
      phoneReportResolvedDays: PHONE_REPORT_RESOLVED_DAYS,
      phoneReportOpenMonths: PHONE_REPORT_OPEN_MONTHS,
      businessContactDeleted: deleted.businessContact,
      businessContactRetentionMonths: BUSINESS_CONTACT_RETENTION_MONTHS,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
