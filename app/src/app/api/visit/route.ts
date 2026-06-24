import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Атомарно увеличава брояча на посетителите и връща поредния номер.
// Извиква се веднъж на браузър (началният екран пази номера локално).
export async function POST() {
  // Лек таван срещу изкуствено надуване (споделени IP-та се толерират).
  if (!rateLimit(await clientKey("visit"), 30, 10 * 60 * 1000)) {
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
