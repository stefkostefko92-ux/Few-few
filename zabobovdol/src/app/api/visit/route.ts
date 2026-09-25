import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ден YYYY-MM-DD в часова зона Европа/София (за да се сменя броенето в полунощ
// местно време, а не в UTC).
function daySofia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Дневно осолен хеш на IP: различен всеки ден (не свързва посещения през дни) и
// невъзстановим без тайната. НЕ пазим суров IP никъде.
function dailyIpHash(day: string, ip: string): string {
  const salt = process.env.AUTH_SECRET || "zbd";
  return createHash("sha256").update(`${day}:${ip}:${salt}`).digest("hex");
}

// Увеличава брояча на посетителите ВЕДНЪЖ на уникално IP за деня. Същото IP,
// посетило пак същия ден → не се брои (връща вече присвоения номер); на другия
// ден същото IP се брои наново.
export async function POST() {
  // Лек таван срещу изкуствено надуване.
  if (!rateLimit(await clientKey("visit"), 30, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  try {
    const day = daySofia();
    const ipHash = dailyIpHash(day, await clientIp());

    // Уникалният ключ (day, ipHash) е ГЕЙТЪТ: опитваме да „заемем" реда пръв.
    // Само първото посещение за деня успява да го създаде и после увеличава
    // брояча — така състезаещи се заявки от същото IP не броят двойно.
    try {
      await prisma.visitDay.create({ data: { day, ipHash } });
    } catch {
      // Вече броено днес за това IP — връщаме присвоения номер (ако е готов).
      const row = await prisma.visitDay.findUnique({
        where: { day_ipHash: { day, ipHash } },
      });
      return NextResponse.json({ ok: true, n: row?.seq ?? 0, counted: false });
    }

    // Ние сме единственият „пръв за деня" → увеличаваме общия брояч.
    const rows = await prisma.$queryRaw<{ value: number }[]>`
      INSERT INTO "Counter" ("key", "value", "updatedAt")
      VALUES ('visitors', 1, now())
      ON CONFLICT ("key")
      DO UPDATE SET "value" = "Counter"."value" + 1, "updatedAt" = now()
      RETURNING "value"`;
    const n = Number(rows[0]?.value ?? 0);
    await prisma.visitDay.update({
      where: { day_ipHash: { day, ipHash } },
      data: { seq: n },
    });

    // Хигиена/срок на съхранение: пазим само записите за днес.
    prisma.visitDay.deleteMany({ where: { day: { lt: day } } }).catch(() => {});

    return NextResponse.json({ ok: true, n, counted: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
