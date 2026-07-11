"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin, type SessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { getResource, type Field, type Resource } from "@/lib/admin/resources";

// Изисква ADMIN за ресурси, маркирани adminOnly; иначе всеки влязъл потребител.
async function authorize(resource: Resource): Promise<SessionUser> {
  return resource.adminOnly ? requireAdmin() : requireUser();
}

// Полета, които съдържат адреси — пазим се от опасни схеми (напр. javascript:).
const URL_FIELDS = new Set([
  "imageUrl",
  "linkUrl",
  "url",
  "website",
  "facebook",
  "coverImage",
  "sourceUrl",
]);
function isSafeUrl(value: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  // Разрешаваме вътрешни пътища и безопасни схеми.
  if (v.startsWith("/")) return true;
  return /^(https?:|mailto:|tel:)/i.test(v);
}

// Динамичен достъп до Prisma делегатите по име на модел.
type Delegate = {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  create: (a: unknown) => Promise<{ id: string }>;
  update: (a: unknown) => Promise<{ id: string }>;
  delete: (a: unknown) => Promise<unknown>;
};
function delegate(model: string): Delegate {
  return (prisma as unknown as Record<string, Delegate>)[model];
}

const NULLABLE_NUMBERS = new Set(["lat", "lng"]);

function coerce(field: Field, raw: FormDataEntryValue | null): unknown {
  switch (field.type) {
    case "boolean":
      return raw === "on" || raw === "true";
    case "number": {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (s === "") return NULLABLE_NUMBERS.has(field.name) ? null : 0;
      const n = Number(s.replace(",", "."));
      if (!Number.isFinite(n)) return NULLABLE_NUMBERS.has(field.name) ? null : 0;
      return n;
    }
    case "datetime": {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) return null;
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    default:
      return typeof raw === "string" ? raw.trim() : "";
  }
}

async function uniqueSlugFor(
  model: string,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const root = slugify(desired) || "elem";
  // Зареждаме само кандидатите със същия корен — ограничена заявка.
  const rows = await delegate(model).findMany({
    where: { slug: { startsWith: root } },
    select: { id: true, slug: true },
  });
  const taken = new Set(
    rows.filter((r) => r.id !== excludeId).map((r) => String(r.slug)),
  );
  if (!taken.has(root)) return root;
  let i = 2;
  while (taken.has(`${root}-${i}`)) i++;
  return `${root}-${i}`;
}

function buildData(resource: Resource, formData: FormData) {
  const data: Record<string, unknown> = {};
  for (const field of resource.fields) {
    if (field.name === "slug") continue; // обработва се отделно
    data[field.name] = coerce(field, formData.get(field.name));
  }
  return data;
}

export async function saveRecord(
  resourceKey: string,
  id: string | null,
  formData: FormData,
): Promise<void> {
  const resource = getResource(resourceKey);
  if (!resource) throw new Error("Непознат ресурс");
  const user = await authorize(resource);

  // Отхвърляме опасни URL схеми в адресните полета.
  for (const field of resource.fields) {
    if (URL_FIELDS.has(field.name)) {
      const raw = formData.get(field.name);
      if (typeof raw === "string" && !isSafeUrl(raw)) {
        redirect(
          `/admin/${resource.key}/${id ?? "new"}?error=` +
            encodeURIComponent(
              `Полето „${field.label}“ има непозволен адрес. Допустими са http(s), tel:, mailto: или вътрешен път.`,
            ),
        );
      }
    }
  }

  // Сървърна проверка на задължителните полета — чисто съобщение вместо суров
  // грешен запис в базата (ако някой заобиколи HTML валидацията).
  for (const field of resource.fields) {
    if (field.required) {
      const raw = formData.get(field.name);
      const val = typeof raw === "string" ? raw.trim() : raw;
      if (!val) {
        redirect(
          `/admin/${resource.key}/${id ?? "new"}?error=` +
            encodeURIComponent(`Полето „${field.label}“ е задължително.`),
        );
      }
    }
  }

  const data = buildData(resource, formData);

  // Slug: ползвай зададения или генерирай от изходното поле.
  let slug = String(formData.get("slug") ?? "").trim();
  if (!slug && resource.slugFrom) {
    slug = String(formData.get(resource.slugFrom) ?? "");
  }
  if (resource.fields.some((f) => f.name === "slug")) {
    data.slug = await uniqueSlugFor(resource.model, slug, id ?? undefined);
  }

  // Автоматична дата на публикуване за новини.
  if (
    resource.fields.some((f) => f.name === "publishedAt") &&
    data.published === true &&
    !data.publishedAt
  ) {
    data.publishedAt = new Date();
  }

  const title = String(data[resource.titleField] ?? slug ?? "запис");

  if (id) {
    await delegate(resource.model).update({ where: { id }, data });
    await logAudit(user, {
      action: "UPDATE",
      entity: resource.model,
      entityId: id,
      summary: `Промяна: ${resource.labelSingular} „${title}“`,
    });
  } else {
    const created = await delegate(resource.model).create({ data });
    await logAudit(user, {
      action: "CREATE",
      entity: resource.model,
      entityId: created.id,
      summary: `Създаване: ${resource.labelSingular} „${title}“`,
    });
  }

  revalidatePath("/", "layout");
  redirect(`/admin/${resource.key}?saved=1`);
}

export async function deleteRecord(
  resourceKey: string,
  id: string,
): Promise<void> {
  const resource = getResource(resourceKey);
  if (!resource) throw new Error("Непознат ресурс");
  const user = await authorize(resource);

  const row = await delegate(resource.model).findUnique({ where: { id } });
  const title = row ? String(row[resource.titleField] ?? id) : id;

  await delegate(resource.model).delete({ where: { id } });
  await logAudit(user, {
    action: "DELETE",
    entity: resource.model,
    entityId: id,
    summary: `Изтриване: ${resource.labelSingular} „${title}“`,
  });

  revalidatePath("/", "layout");
  redirect(`/admin/${resource.key}?deleted=1`);
}

export async function togglePublish(
  resourceKey: string,
  id: string,
  next: boolean,
): Promise<void> {
  const resource = getResource(resourceKey);
  if (!resource) throw new Error("Непознат ресурс");
  const user = await authorize(resource);

  const data: Record<string, unknown> = { published: next };
  if (
    next &&
    resource.fields.some((f) => f.name === "publishedAt")
  ) {
    const row = await delegate(resource.model).findUnique({ where: { id } });
    if (row && !row.publishedAt) data.publishedAt = new Date();
  }

  await delegate(resource.model).update({ where: { id }, data });
  await logAudit(user, {
    action: next ? "PUBLISH" : "UNPUBLISH",
    entity: resource.model,
    entityId: id,
    summary: `${next ? "Публикуване" : "Скриване"}: ${resource.labelSingular}`,
  });

  revalidatePath("/", "layout");
  redirect(`/admin/${resource.key}`);
}
