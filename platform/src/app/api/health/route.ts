import { NextResponse } from "next/server";

// Лека здравна проверка за HEALTHCHECK / оркестрация (Docker, autodeploy, cron).
// Нарочно НЕ чука базата — само доказва, че процесът приема HTTP заявки.
// Извън middleware guard-а е (пази само /dashboard и /admin), затова е публична.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { status: "ok", service: "platform", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
