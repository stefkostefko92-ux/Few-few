import type { Resource, Field } from "@/lib/admin/resources";

// Превръща стойност от базата в стойност, годна за HTML формуляр.
function toFormValue(field: Field, raw: unknown): string | boolean {
  if (field.type === "boolean") return Boolean(raw);
  if (raw === null || raw === undefined) return "";
  if (field.type === "datetime") {
    const d = raw instanceof Date ? raw : new Date(String(raw));
    if (isNaN(d.getTime())) return "";
    // Сървърът работи в UTC (TZ=UTC), затова показваме UTC в полето.
    return d.toISOString().slice(0, 16);
  }
  return String(raw);
}

export function buildInitial(
  resource: Resource,
  record: Record<string, unknown> | null,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const field of resource.fields) {
    if (record) {
      out[field.name] = toFormValue(field, record[field.name]);
      continue;
    }
    // Стойности по подразбиране за нов запис.
    if (field.type === "boolean") {
      out[field.name] =
        field.name === "published" && resource.key !== "listings";
    } else if (field.type === "select") {
      out[field.name] = field.options?.[0]?.value ?? "";
    } else {
      out[field.name] = "";
    }
  }
  return out;
}

export function displayCell(field: Field, raw: unknown): string {
  if (field.type === "boolean") return raw ? "Да" : "Не";
  if (raw === null || raw === undefined || raw === "") return "—";
  if (field.type === "datetime") {
    const d = raw instanceof Date ? raw : new Date(String(raw));
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("bg-BG", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }
  if (field.type === "select") {
    return field.options?.find((o) => o.value === String(raw))?.label ?? String(raw);
  }
  const s = String(raw);
  return s.length > 60 ? s.slice(0, 59) + "…" : s;
}
