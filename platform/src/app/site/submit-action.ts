"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { sendMail, mailConfigured } from "@/lib/mailer";
import { z } from "zod";

export type SubmitState = { ok?: boolean; error?: string };

const schema = z.object({
  site: z.string().min(1).max(64),
  name: z.string().trim().min(1, "Въведете име.").max(120),
  email: z.string().trim().toLowerCase().email("Невалиден имейл."),
  message: z.string().trim().min(1, "Въведете съобщение.").max(4000),
  pagePath: z.string().max(300).optional(),
  // honeypot — истински потребител го оставя празен; ботовете го попълват
  company: z.string().max(0).optional(),
});

// Публично: получава заявка от контактна форма на сайт и я записва.
export async function submitContactAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const parsed = schema.safeParse({
    site: formData.get("site"),
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
    pagePath: formData.get("pagePath") ?? undefined,
    company: formData.get("company") ?? undefined,
  });
  if (!parsed.success) {
    // honeypot попълнен → преструваме се на успех (не даваме сигнал на бота)
    if (parsed.error.issues.some((i) => i.path[0] === "company")) {
      return { ok: true };
    }
    return { error: parsed.error.issues[0]?.message ?? "Проверете полетата." };
  }
  const d = parsed.data;

  const hdrs = await headers();
  // Последната стойност е добавената от доверения reverse proxy; първата е
  // клиентски-контролируема (nginx append-ва) → взимаме последната срещу spoof.
  const ip = hdrs.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
  if (!rateLimit(`contact:${ip}`, 5, 10 * 60_000)) {
    return { error: "Твърде много заявки. Опитайте по-късно." };
  }

  const site = await prisma.site.findUnique({
    where: { slug: d.site },
    select: { id: true, name: true, slug: true },
  });
  if (!site) return { error: "Сайтът не е намерен." };

  await prisma.formSubmission.create({
    data: {
      siteId: site.id,
      name: d.name,
      email: d.email,
      message: d.message,
      pagePath: d.pagePath || null,
    },
  });

  // Известие по имейл до отговорниците на сайта (ако SMTP е конфигуриран).
  // Не блокира успеха на заявката — при липса/грешка просто остава в таблото.
  if (mailConfigured()) {
    await notifyManagers(site, d);
  }
  return { ok: true };
}

type SiteRef = { id: string; name: string; slug: string };

async function notifyManagers(
  site: SiteRef,
  d: { name: string; email: string; message: string; pagePath?: string },
): Promise<void> {
  try {
    // Отговорници: мениджърите на сайта; ако няма — собствениците на платформата.
    const managers = await prisma.user.findMany({
      where: {
        active: true,
        memberships: { some: { siteId: site.id, role: "MANAGER" } },
      },
      select: { email: true },
    });
    let recipients = managers.map((m) => m.email);
    if (recipients.length === 0) {
      const owners = await prisma.user.findMany({
        where: { active: true, role: "OWNER" },
        select: { email: true },
      });
      recipients = owners.map((o) => o.email);
    }
    if (recipients.length === 0) return;

    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const dash = `${base}/dashboard/sites/${site.slug}/submissions`;
    await sendMail({
      to: recipients,
      replyTo: d.email,
      subject: `Нова заявка от формата на „${site.name}“`,
      text:
        `Ново запитване през сайта „${site.name}“:\n\n` +
        `Име: ${d.name}\nИмейл: ${d.email}\n` +
        (d.pagePath ? `Страница: ${d.pagePath}\n` : "") +
        `\nСъобщение:\n${d.message}\n\n` +
        `Виж всички заявки: ${dash}`,
    });
  } catch (err) {
    // Известието е второстепенно — не бива да чупи изпращането на формата.
    console.error("Известие за заявка: неуспех", err);
  }
}
