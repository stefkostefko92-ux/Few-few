"use client";

import { useEffect, useState } from "react";

type Media = { id: string; url: string; filename: string; alt: string };

export default function MediaPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const refresh = async () => {
    const res = await fetch("/api/admin/media");
    const json = await res.json();
    setMedia(json.media || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/media", { method: "POST", body: fd });
    const json = await res.json();
    setUploading(false);
    if (json.ok) { await refresh(); onPick(json.media.url); }
  }

  return (
    <div role="dialog" aria-modal="true" style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <b>Изберете снимка</b>
          <label className="ad-btn ad-btn--primary" style={{ cursor: "pointer" }}>
            {uploading ? "Качване…" : "Качи нова"}
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
        {loading ? (
          <p style={{ color: "var(--ad-muted)" }}>Зареждане…</p>
        ) : media.length === 0 ? (
          <p style={{ color: "var(--ad-muted)" }}>Няма снимки. Качете първата по-горе.</p>
        ) : (
          <div className="ad-media-grid">
            {media.map((m) => (
              <button key={m.id} className="ad-media" style={{ cursor: "pointer", textAlign: "left", border: "1px solid var(--ad-line)" }} onClick={() => onPick(m.url)} type="button">
                <div className="ad-media__img"><img src={m.url} alt={m.alt} /></div>
                <div className="ad-media__body"><div className="ad-media__name">{m.filename}</div></div>
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: "1rem", textAlign: "right" }}>
          <button className="ad-btn ad-btn--ghost" onClick={onClose} type="button">Затвори</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(17,19,26,.55)", display: "grid", placeItems: "center", padding: "1.5rem", zIndex: 200 };
const modal: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: "1.4rem", width: "min(760px, 100%)", maxHeight: "85vh", overflow: "auto", boxShadow: "0 30px 60px -20px rgba(0,0,0,.5)" };
