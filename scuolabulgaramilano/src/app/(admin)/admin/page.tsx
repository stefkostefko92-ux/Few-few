import Link from "next/link";
import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/content";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await ensureSeeded();
  const [sections, mediaCount, leads, unhandled, recent] = await Promise.all([
    prisma.content.findMany({ orderBy: { order: "asc" } }),
    prisma.media.count(),
    prisma.lead.count(),
    prisma.lead.count({ where: { handled: false } }),
    prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  return (
    <AdminShell active="dashboard" title="Dashboard" subtitle="Panoramica del sito e accesso rapido alla gestione.">
      <div className="ad-welcome">
        <div>
          <h2>Benvenuto nel pannello di Qui Bulgaria 👋</h2>
          <p>Da qui gestisci tutto il sito: testi nelle tre lingue, immagini e richieste. Nessun codice, tutto con pochi clic.</p>
        </div>
        <div className="ad-welcome__links">
          <Link className="ad-btn ad-btn--primary" href="/admin/content">Modifica i contenuti</Link>
          <Link className="ad-btn ad-btn--ghost" href="/admin/media">Carica immagini</Link>
        </div>
      </div>

      <div className="ad-stats">
        <div className="ad-stat"><div className="n">{sections.length}</div><div className="l">Sezioni di contenuto</div></div>
        <div className="ad-stat"><div className="n">3</div><div className="l">Lingue (IT · BG · EN)</div></div>
        <div className="ad-stat"><div className="n">{mediaCount}</div><div className="l">Immagini caricate</div></div>
        <div className="ad-stat"><div className="n">{unhandled}<span style={{ fontSize: "1rem", color: "var(--ad-muted)" }}> / {leads}</span></div><div className="l">Richieste da gestire</div></div>
      </div>

      <div className="ad-head" style={{ marginBottom: ".8rem" }}>
        <div><h1 style={{ fontSize: "1.15rem" }}>Sezioni del sito</h1></div>
        <Link className="ad-btn ad-btn--ghost" href="/admin/content">Gestisci tutto</Link>
      </div>
      <div className="ad-grid">
        {sections.map((s) => (
          <Link key={s.key} className="ad-card" href={`/admin/content/${s.key}`}>
            <div>
              <h3>{s.label || s.key}</h3>
              <p>Modifica testi e immagini in tre lingue</p>
            </div>
            <div className="meta">
              <span className={`ad-badge ${s.enabled ? "on" : "off"}`}>{s.enabled ? "Visibile" : "Nascosta"}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </Link>
        ))}
        {sections.length === 0 && (
          <div className="ad-empty">Nessun contenuto. Esegui <code>npm run setup</code> per inizializzare il database.</div>
        )}
      </div>

      {recent.length > 0 && (
        <>
          <div className="ad-head" style={{ margin: "2rem 0 .8rem" }}>
            <div><h1 style={{ fontSize: "1.15rem" }}>Ultime richieste</h1></div>
            <Link className="ad-btn ad-btn--ghost" href="/admin/leads">Tutte</Link>
          </div>
          <div className="ad-grid">
            {recent.map((l) => (
              <div className="ad-card" key={l.id}>
                <div>
                  <h3>{l.name} · <span style={{ fontWeight: 400, color: "var(--ad-muted)" }}>{l.topic}</span></h3>
                  <p>{l.email}</p>
                </div>
                <div className="meta">
                  <span className={`ad-badge ${l.handled ? "on" : "off"}`}>{l.handled ? "Gestita" : "Nuova"}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AdminShell>
  );
}
