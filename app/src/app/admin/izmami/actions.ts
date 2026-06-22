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
  summary: z.string().optional().default(""),
  body: z.string().optional().default(""),
  severity: z.enum(["info", "warning", "danger"]),
  pinned: z.boolean(),
});

function revalidate() {
  revalidatePath("/admin/izmami");
  revalidatePath("/izmami");
  revalidatePath("/");
}

export async function createScam(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const parsed = schema.safeParse({
    title: field(formData, "title", 200),
    summary: field(formData, "summary", 300),
    body: field(formData, "body", 4000),
    severity: field(formData, "severity", 10) || "warning",
    pinned: formData.get("pinned") === "on",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Грешка." };
  }
  try {
    const existing = await prisma.scamAlert.findMany({ select: { slug: true } });
    const slug = uniqueSlug(slugify(parsed.data.title), new Set(existing.map((x) => x.slug)));
    const created = await prisma.scamAlert.create({
      data: {
        slug,
        title: parsed.data.title,
        summary: parsed.data.summary,
        body: parsed.data.body,
        severity: parsed.data.severity,
        pinned: parsed.data.pinned,
        published: true,
      },
    });
    await audit({ userEmail: session.sub, action: "CREATE", entity: "ScamAlert", entityId: created.id, summary: `Предупреждение: ${created.title}` });
  } catch {
    return { ok: false, message: "Неуспешен запис. Проверете базата данни." };
  }
  revalidate();
  return { ok: true, message: "Предупреждението е добавено." };
}

export async function togglePin(fd: FormData) {
  const session = await requireSession();
  const id = String(fd.get("id") ?? "");
  const pin = fd.get("pin") === "1";
  if (!id) return;
  await prisma.scamAlert.update({ where: { id }, data: { pinned: pin } });
  await audit({ userEmail: session.sub, action: "UPDATE", entity: "ScamAlert", entityId: id, summary: pin ? "Закачено" : "Откачено" });
  revalidate();
}

export async function deleteScam(fd: FormData) {
  const session = await requireSession();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await prisma.scamAlert.delete({ where: { id } });
  await audit({ userEmail: session.sub, action: "DELETE", entity: "ScamAlert", entityId: id, summary: "Предупреждение изтрито" });
  revalidate();
}
