"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { slugify, uniqueSlug } from "@/lib/slug";
import { field, type FormState } from "@/lib/forms";

const schema = z.object({
  title: z.string().min(3, "Заглавието е твърде кратко."),
  startAt: z.string().min(1, "Посочете начална дата и час."),
  location: z.string().optional().default(""),
  description: z.string().optional().default(""),
  organizer: z.string().optional().default(""),
  url: z.string().optional().default(""),
});

export async function createEvent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const parsed = schema.safeParse({
    title: field(formData, "title", 200),
    startAt: field(formData, "startAt", 40),
    location: field(formData, "location", 200),
    description: field(formData, "description", 3000),
    organizer: field(formData, "organizer", 200),
    url: field(formData, "url", 300),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Грешка." };
  }
  const start = new Date(parsed.data.startAt);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, message: "Невалидна дата." };
  }
  try {
    const existing = await prisma.event.findMany({ select: { slug: true } });
    const slug = uniqueSlug(
      slugify(parsed.data.title),
      new Set(existing.map((x) => x.slug)),
    );
    const ev = await prisma.event.create({
      data: {
        slug,
        title: parsed.data.title,
        startAt: start,
        location: parsed.data.location,
        description: parsed.data.description,
        organizer: parsed.data.organizer,
        url: parsed.data.url,
        published: true,
      },
    });
    await audit({
      userEmail: session.sub,
      action: "CREATE",
      entity: "Event",
      entityId: ev.id,
      summary: `Добавено събитие: ${ev.title}`,
    });
  } catch {
    return { ok: false, message: "Неуспешен запис. Проверете базата данни." };
  }
  revalidatePath("/admin/sabitiya");
  revalidatePath("/sabitiya");
  return { ok: true, message: "Събитието е добавено." };
}

export async function deleteEvent(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.event.delete({ where: { id } });
  await audit({
    userEmail: session.sub,
    action: "DELETE",
    entity: "Event",
    entityId: id,
    summary: "Събитие изтрито",
  });
  revalidatePath("/admin/sabitiya");
  revalidatePath("/sabitiya");
}
