import Link from "next/link";
import { prisma } from "@/lib/db";
import AdminShell from "@/components/admin/AdminShell";
import EnableToggle from "@/components/admin/EnableToggle";
import { ensureSeeded } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function ContentList() {
  await ensureSeeded();
  const sections = await prisma.content.findMany({ orderBy: { order: "asc" } });
  return (
    <AdminShell active="content" title="Contenuti" subtitle="Tutti i testi e le immagini del sito, in italiano, bulgaro e inglese.">
      <div className="ad-grid">
        {sections.map((s) => (
          <div className="ad-card" key={s.key}>
            <div>
              <h3>{s.label || s.key}</h3>
              <p>Chiave: <code>{s.key}</code></p>
            </div>
            <div className="meta">
              {s.group !== "settings" && <EnableToggle contentKey={s.key} enabled={s.enabled} />}
              <Link className="ad-btn ad-btn--primary" href={`/admin/content/${s.key}`}>Modifica</Link>
            </div>
          </div>
        ))}
        {sections.length === 0 && (
          <div className="ad-empty">Nessun contenuto trovato. Esegui <code>npm run setup</code>.</div>
        )}
      </div>
    </AdminShell>
  );
}
