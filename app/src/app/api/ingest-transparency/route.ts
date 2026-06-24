import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { fetchSigmaSnapshot, saveTransparency } from "@/lib/transparency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Защитен адрес за обновяване на данните за прозрачност (по график/cron):
//   curl -H "Authorization: Bearer ТАЙНА" https://.../api/ingest-transparency
// Тегли свежа снимка от СИГМА и я записва в кеша. Същият INGEST_TOKEN.
async function handle(req: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Неоторизиран достъп" }, { status: 401 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const provided = bearer || new URL(req.url).searchParams.get("token") || "";
  if (!provided || !safeEqual(provided, token)) {
    return NextResponse.json({ error: "Неоторизиран достъп" }, { status: 401 });
  }
  const snap = await fetchSigmaSnapshot();
  if (!snap) {
    return NextResponse.json(
      { ok: false, error: "Неуспешно теглене/разчитане на данните от СИГМА." },
      { status: 502 },
    );
  }
  await saveTransparency(snap);
  return NextResponse.json({
    ok: true,
    totalValue: snap.totalValue,
    contractsCount: snap.contractsCount,
    suppliers: snap.topSuppliers.length,
    updatedAt: snap.updatedAt,
  });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
