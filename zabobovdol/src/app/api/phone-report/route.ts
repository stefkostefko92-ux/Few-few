import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// „Този номер е сгрешен“ — сигнал без вход и без лични данни. Пазим само коя
// услуга е и (по желание) кратката бележка. Никакъв IP, UA или идентификатор
// не влиза в базата; IP се ползва само в паметта за лимита на заявките.

const MAX_BODY = 4_096;

const schema = z.object({
  serviceId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  note: z
    .string()
    .trim()
    .max(500, "Бележката е твърде дълга — до 500 знака.")
    .optional()
    .default(""),
  website: z.string().max(500).optional().default(""), // honeypot
});

const bad = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  if (!rateLimit(await clientKey("phone"))) return bad(RATE_LIMIT_MESSAGE, 429);

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return bad("Сигналът е твърде дълъг.", 413);
    raw = JSON.parse(text);
  } catch {
    return bad("Невалидни данни.");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const noteIssue = parsed.error.issues.find((i) => i.path[0] === "note");
    return bad(noteIssue?.message ?? "Невалидни данни.");
  }
  const d = parsed.data;

  // Ботът е попълнил скритото поле — отговаряме „добре“, без да пишем нищо,
  // за да не научи, че е хванат.
  if (d.website) return NextResponse.json({ ok: true });

  const service = await prisma.service.findFirst({
    where: { id: d.serviceId, published: true },
    select: { id: true, name: true, slug: true, phone: true },
  });
  if (!service) return bad("Тази услуга не е намерена.", 404);

  const created = await prisma.phoneReport.create({
    data: { serviceId: service.id, note: d.note },
  });

  await logAudit(null, {
    action: "CREATE",
    entity: "PhoneReport",
    entityId: created.id,
    summary: `Сигнал за сгрешен номер — ${service.name}`,
  });

  // Известие към екипа (ако SMTP е настроен); иначе сигналът чака в админ
  // панела („Сгрешени номера“).
  await sendMail({
    to: SITE.contact.email,
    subject: `Сигнал за сгрешен номер: ${service.name}`,
    text: [
      "Посетител съобщи, че номерът може да е сгрешен.",
      "",
      `Услуга: ${service.name}`,
      `Номер на сайта: ${service.phone || "—"}`,
      `Страница: ${SITE.url}/uslugi/${service.slug}`,
      "",
      "Бележка:",
      d.note || "—",
      "",
      `Админ панел: ${SITE.url}/admin/greshni-nomera`,
    ].join("\n"),
  });

  return NextResponse.json({ ok: true });
}
