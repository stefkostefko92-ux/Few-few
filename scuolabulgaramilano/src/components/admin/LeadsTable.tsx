"use client";

import { useState } from "react";

type Lead = { id: string; name: string; email: string; topic: string; message: string; locale: string; handled: boolean; createdAt: string };

export default function LeadsTable({ initial }: { initial: Lead[] }) {
  const [leads, setLeads] = useState(initial);

  async function toggle(id: string, handled: boolean) {
    await fetch("/api/admin/leads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, handled }) });
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, handled } : l)));
  }
  async function remove(id: string) {
    if (!confirm("Eliminare questa richiesta?")) return;
    await fetch("/api/admin/leads", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setLeads((ls) => ls.filter((l) => l.id !== id));
  }

  if (leads.length === 0) return <div className="ad-empty">Nessuna richiesta ricevuta.</div>;

  return (
    <table className="ad-table">
      <thead>
        <tr><th>Data</th><th>Contatto</th><th>Interesse</th><th>Messaggio</th><th>Stato</th><th /></tr>
      </thead>
      <tbody>
        {leads.map((l) => (
          <tr key={l.id}>
            <td style={{ whiteSpace: "nowrap" }}>{new Date(l.createdAt).toLocaleDateString("it-IT")}<br /><small style={{ color: "var(--ad-muted)" }}>{l.locale.toUpperCase()}</small></td>
            <td><b>{l.name}</b><br /><a href={`mailto:${l.email}`} style={{ color: "var(--ad-brand)" }}>{l.email}</a></td>
            <td>{l.topic}</td>
            <td style={{ maxWidth: 320 }}>{l.message}</td>
            <td><span className={`ad-badge ${l.handled ? "on" : "off"}`}>{l.handled ? "Gestita" : "Nuova"}</span></td>
            <td style={{ whiteSpace: "nowrap" }}>
              <button className="ad-btn ad-btn--ghost" style={{ padding: ".35rem .6rem", fontSize: ".8rem" }} onClick={() => toggle(l.id, !l.handled)}>{l.handled ? "Riapri" : "Segna gestita"}</button>{" "}
              <button className="ad-btn ad-btn--danger" style={{ padding: ".35rem .6rem", fontSize: ".8rem" }} onClick={() => remove(l.id)}>Elimina</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
