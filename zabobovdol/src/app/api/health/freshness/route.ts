import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { checkFreshness, freshnessText } from "@/lib/freshness";
import { sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Сравнение в постоянно време, за да не изтича информация по таймингите.
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const Query = z.object({ notify: z.enum(["0", "1"]).optional() });

const NO_STORE = { "cache-control": "no-store" };

// Проверка за свежест на данните — за мониторинг и cron (виж DEPLOY.md):
//   curl -H "Authorization: Bearer ТАЙНА" https://.../api/health/freshness
// Защитена със същия INGEST_TOKEN като /api/ingest-*. Винаги 200, когато
// проверката е минала; проблемите са в `ok:false` + `problems` (за да ги чете
// мониторингът, без да ги бърка със срив). 503 — само ако базата не отговаря.
// С ?notify=1 при проблем праща имейл до FRESHNESS_ALERT_EMAIL (или ADMIN_EMAIL),
// ако SMTP е настроен — само обобщение, без лични данни.
export async function GET(req: Request) {
  const token = process.env.INGEST_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const url = new URL(req.url);
  const provided = bearer || url.searchParams.get("token") || "";
  if (!token || !provided || !safeEqual(provided, token)) {
    return NextResponse.json({ error: "Неоторизиран достъп" }, { status: 401, headers: NO_STORE });
  }

  const q = Query.safeParse({ notify: url.searchParams.get("notify") ?? undefined });
  if (!q.success) {
    return NextResponse.json({ error: "Невалидна заявка" }, { status: 400, headers: NO_STORE });
  }

  let checked: Awaited<ReturnType<typeof checkFreshness>>;
  try {
    checked = await checkFreshness();
  } catch (err) {
    console.error("[freshness] грешка при проверката:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Базата не отговаря — проверката не е направена." },
      { status: 503, headers: NO_STORE },
    );
  }
  const { result, input } = checked;

  let notified: { sent: boolean; reason?: string } | undefined;
  if (!result.ok && q.data.notify === "1") {
    const to = process.env.FRESHNESS_ALERT_EMAIL || process.env.ADMIN_EMAIL || "";
    notified = to
      ? await sendMail({
          to,
          subject: `„За Бобов дол“: остарели данни (${result.problems.length})`,
          text: `${freshnessText(result)}\n\nПроверката: /api/health/freshness`,
        })
      : { sent: false, reason: "няма адрес за известие" };
  }

  if (!result.ok) console.warn(`[freshness] ${freshnessText(result).replace(/\n/g, " | ")}`);

  return NextResponse.json(
    {
      ...result,
      stats: {
        news: input.news,
        pharmacy: input.pharmacy,
        scams: input.scams,
        outages: input.outages,
        services: {
          total: input.services.total,
          neverVerified: input.services.neverVerified,
          stale: input.services.stale,
        },
      },
      ...(notified ? { notified } : {}),
    },
    { headers: NO_STORE },
  );
}
