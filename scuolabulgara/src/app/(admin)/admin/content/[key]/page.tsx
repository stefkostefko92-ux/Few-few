import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import AdminShell from "@/components/admin/AdminShell";
import ContentEditor from "@/components/admin/ContentEditor";
import { defaultFor } from "@/lib/defaults";
import { mergeSection } from "@/lib/cms";
import { ensureSeeded } from "@/lib/content";
import { previewUrl } from "@/lib/admin-preview";
import type { Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// The same merge the public site uses: the editor always sees the current
// schema — new fields appear with their defaults, retired ones (e.g. the old
// colour tiles of the gallery) are dropped — and saving upgrades the row.
function parse(raw: string, key: string, locale: Locale) {
  let stored: unknown;
  try {
    stored = JSON.parse(raw || "{}");
  } catch {}
  return mergeSection(defaultFor(key, locale), stored);
}

export default async function ContentEditPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  await ensureSeeded();
  const row = await prisma.content.findUnique({ where: { key } });
  if (!row) notFound();

  const initial = {
    it: parse(row.it, row.key, "it"),
    bg: parse(row.bg, row.key, "bg"),
    en: parse(row.en, row.key, "en"),
  };

  return (
    <AdminShell
      active="content"
      title={row.label || row.key}
      subtitle="Редактирайте съдържанието на трите езика. Промените влизат в сила веднага след запазване."
      actions={
        <div style={{ display: "flex", gap: ".5rem" }}>
          <a className="qba-btn qba-btn--ghost" href={previewUrl(row.key)} target="_blank" rel="noopener">Преглед ↗</a>
          <Link className="qba-btn qba-btn--ghost" href="/admin/content">← Всички секции</Link>
        </div>
      }
    >
      <ContentEditor contentKey={row.key} initial={initial} template={defaultFor(row.key, "it")} />
    </AdminShell>
  );
}
