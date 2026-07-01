import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Насрочено публикуване: публикува страниците, чието publishAt е настъпило.
// Копира draftBlocks* → blocks*, слага status=PUBLISHED и чисти publishAt.
// Пази се със същия таен токен като другите cron-и.
//   curl -X POST -H "Authorization: Bearer ТАЙНА" https://.../api/cron/publish

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function POST(req: NextRequest) {
  const token = process.env.CRON_TOKEN;
  if (!token) return NextResponse.json({ error: "CRON_TOKEN не е зададен." }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${token}`)) {
    return NextResponse.json({ error: "Неоторизиран." }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.page.findMany({
    where: { publishAt: { not: null, lte: now } },
    select: { id: true, siteId: true, title: true, draftBlocks: true, draftBlocksEn: true, draftBlocksIt: true, publishedAt: true },
  });

  let published = 0;
  for (const p of due) {
    await prisma.page.update({
      where: { id: p.id },
      data: {
        status: "PUBLISHED",
        publishedAt: p.publishedAt ?? now,
        publishAt: null,
        blocks: p.draftBlocks as object,
        blocksEn: p.draftBlocksEn as object,
        blocksIt: p.draftBlocksIt as object,
      },
    });
    published++;
  }

  if (published > 0) {
    await logAudit(null, {
      action: "UPDATE",
      entity: "Page",
      summary: `Насрочено публикуване: ${published} страници`,
    });
  }

  return NextResponse.json({ published });
}
