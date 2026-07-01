"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
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
    select: { id: true },
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
  return { ok: true };
}
