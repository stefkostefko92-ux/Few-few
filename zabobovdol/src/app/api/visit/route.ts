import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Атомарно увеличава брояча на посетителите и връща поредния номер.
// Извиква се при ВСЯКО зареждане на сайта (виж IntroSplash).
export async function POST() {
  // Таван срещу изкуствено надуване. Ключът е по IP, а зад един адрес често
  // стоят много хора (читалище, кметство, мобилен оператор), затова е широк —
  // реже само скриптово надуване, не нормално разглеждане.
  if (!rateLimit(await clientKey("visit"), 120, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  try {
    const rows = await prisma.$queryRaw<{ value: number }[]>`
      INSERT INTO "Counter" ("key", "value", "updatedAt")
      VALUES ('visitors', 1, now())
      ON CONFLICT ("key")
      DO UPDATE SET "value" = "Counter"."value" + 1, "updatedAt" = now()
      RETURNING "value"`;
    const n = Number(rows[0]?.value ?? 0);
    return NextResponse.json({ ok: true, n });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
