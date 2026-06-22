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
  excerpt: z.string().optional().default(""),
  content: z.string().optional().default(""),
  source: z.string().optional().default(""),
  sourceUrl: z.string().optional().default(""),
});

export async function createPost(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const parsed = schema.safeParse({
    title: field(formData, "title", 200),
    excerpt: field(formData, "excerpt", 400),
    content: field(formData, "content", 8000),
    source: field(formData, "source", 160),
    sourceUrl: field(formData, "sourceUrl", 300),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Грешка." };
  }
  try {
    const existing = await prisma.post.findMany({ select: { slug: true } });
    const slug = uniqueSlug(
      slugify(parsed.data.title),
      new Set(existing.map((x) => x.slug)),
    );
    const post = await prisma.post.create({
      data: {
        slug,
        title: parsed.data.title,
        excerpt: parsed.data.excerpt,
        content: parsed.data.content,
        source: parsed.data.source,
        sourceUrl: parsed.data.sourceUrl,
        published: true,
        publishedAt: new Date(),
      },
    });
    await audit({
      userEmail: session.sub,
      action: "CREATE",
      entity: "Post",
      entityId: post.id,
      summary: `Добавена новина: ${post.title}`,
    });
  } catch {
    return { ok: false, message: "Неуспешен запис. Проверете базата данни." };
  }
  revalidatePath("/admin/novini");
  revalidatePath("/novini");
  return { ok: true, message: "Новината е добавена." };
}

export async function deletePost(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.post.delete({ where: { id } });
  await audit({
    userEmail: session.sub,
    action: "DELETE",
    entity: "Post",
    entityId: id,
    summary: "Новина изтрита",
  });
  revalidatePath("/admin/novini");
  revalidatePath("/novini");
}
