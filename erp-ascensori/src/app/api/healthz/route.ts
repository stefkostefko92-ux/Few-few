// Liveness: „процесът жив ли е". НЕ докосва базата — иначе кратък отказ на
// Postgres предизвиква рестарт-цикъл и каскада. Нищо освен „ok" (без версия,
// без име на база, без uptime — това е информация за непознат).

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ stato: "ok" });
}
