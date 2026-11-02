import Link from "next/link";
import { prisma } from "@/lib/db";
import AdminShell from "@/components/admin/AdminShell";
import EnableToggle from "@/components/admin/EnableToggle";
import { ensureSeeded } from "@/lib/content";
import { previewUrl } from "@/lib/admin-preview";

export const dynamic = "force-dynamic";

export default async function ContentList() {
  await ensureSeeded();
  const sections = await prisma.content.findMany({ orderBy: { order: "asc" } });
  return (
    <AdminShell active="content" title="Съдържание" subtitle="Всички текстове и снимки на сайта — на италиански, български и английски.">
      <div className="ad-help">
        <b>Съвет.</b> Отворете секция, редактирайте текстовете на трите езика и натиснете <em>Запази</em>. Използвайте <em>Преглед</em>, за да я видите в сайта.
      </div>
      <div className="ad-grid">
        {sections.map((s) => (
          <div className="ad-card" key={s.key}>
            <div>
              <h3>{s.label || s.key}</h3>
              <p>Ключ: <code>{s.key}</code></p>
            </div>
            <div className="meta">
              {s.group !== "settings" && <EnableToggle contentKey={s.key} enabled={s.enabled} />}
              <a className="ad-btn ad-btn--ghost" href={previewUrl(s.key)} target="_blank" rel="noopener">Преглед</a>
              <Link className="ad-btn ad-btn--primary" href={`/admin/content/${s.key}`}>Редактирай</Link>
            </div>
          </div>
        ))}
        {sections.length === 0 && (
          <div className="ad-empty">Няма намерено съдържание. Изпълнете <code>npm run setup</code>.</div>
        )}
      </div>
    </AdminShell>
  );
}
