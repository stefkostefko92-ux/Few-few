import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runSync } from "@/lib/sync/bgclubs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Защитена крайна точка за автоматична синхронизация (извиква се от cron).
// Токенът се подава като ?token=... или заглавие „x-sync-token".
// Пример за cron (на всеки 3 часа):
//   7 */3 * * *  curl -fsS "https://minyor.carbonstealth.eu/api/sync?token=ТОКЕН"
async function handle(req: NextRequest) {
  const expected = process.env.SYNC_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "SYNC_TOKEN не е конфигуриран на сървъра." },
      { status: 503 },
    );
  }
  const provided =
    req.nextUrl.searchParams.get("token") ?? req.headers.get("x-sync-token");
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: "Неоторизиран" }, { status: 401 });
  }

  const summary = await runSync();
  return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
