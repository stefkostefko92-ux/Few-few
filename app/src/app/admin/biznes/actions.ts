"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { slugify, uniqueSlug } from "@/lib/slug";
import { field, type FormState } from "@/lib/forms";

const schema = z.object({
  name: z.string().min(2, "Името е твърде кратко."),
  category: z.enum(["SHOP", "FOOD", "SERVICE", "CRAFT", "HEALTH", "OTHER"]),
  description: z.string().optional().default(""),
  address: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  website: z.string().optional().default(""),
});

export async function createBusiness(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const parsed = schema.safeParse({
    name: field(formData, "name", 200),
    category: field(formData, "category", 20) || "OTHER",
    description: field(formData, "description", 2000),
    address: field(formData, "address", 200),
    phone: field(formData, "phone", 60),
    website: field(formData, "website", 300),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Грешка." };
  }
  try {
    const existing = await prisma.business.findMany({ select: { slug: true } });
    const slug = uniqueSlug(
      slugify(parsed.data.name),
      new Set(existing.map((x) => x.slug)),
    );
    const b = await prisma.business.create({
      data: {
        slug,
        name: parsed.data.name,
        category: parsed.data.category,
        description: parsed.data.description,
        address: parsed.data.address,
        phone: parsed.data.phone,
        website: parsed.data.website,
        published: true,
      },
    });
    await audit({
      userEmail: session.sub,
      action: "CREATE",
      entity: "Business",
      entityId: b.id,
      summary: `Добавен бизнес: ${b.name}`,
    });
  } catch {
    return { ok: false, message: "Неуспешен запис. Проверете базата данни." };
  }
  revalidatePath("/admin/biznes");
  revalidatePath("/biznes");
  return { ok: true, message: "Бизнесът е добавен." };
}

export async function deleteBusiness(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.business.delete({ where: { id } });
  await audit({
    userEmail: session.sub,
    action: "DELETE",
    entity: "Business",
    entityId: id,
    summary: "Бизнес изтрит",
  });
  revalidatePath("/admin/biznes");
  revalidatePath("/biznes");
}
