import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import AdminShell from "@/components/admin/AdminShell";
import ContentEditor from "@/components/admin/ContentEditor";
import { defaultFor } from "@/lib/defaults";
import { previewUrl } from "@/lib/admin-preview";
import type { Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function parse(raw: string, key: string, locale: Locale) {
  try {
    const v = JSON.parse(raw || "{}");
    if (v && Object.keys(v).length) return v;
  } catch {}
  return defaultFor(key, locale);
}

export default async function ContentEditPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
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
      subtitle="Modifica i contenuti nelle tre lingue. Le modifiche sono immediate dopo il salvataggio."
      actions={
        <div style={{ display: "flex", gap: ".5rem" }}>
          <a className="ad-btn ad-btn--ghost" href={previewUrl(row.key)} target="_blank" rel="noopener">Anteprima ↗</a>
          <Link className="ad-btn ad-btn--ghost" href="/admin/content">← Tutte le sezioni</Link>
        </div>
      }
    >
      <ContentEditor contentKey={row.key} label={row.label || row.key} initial={initial} />
    </AdminShell>
  );
}
