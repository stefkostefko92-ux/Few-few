"use client";

import { useEffect, useRef, useState } from "react";

type Media = { id: string; url: string; filename: string; alt: string; width?: number; height?: number; size: number };

export default function MediaManager() {
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const res = await fetch("/api/admin/media");
    const json = await res.json();
    setMedia(json.media || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      await fetch("/api/admin/media", { method: "POST", body: fd });
    }
    setUploading(false);
    await refresh();
  }

  async function remove(id: string) {
    if (!confirm("Да изтрия ли тази снимка?")) return;
    await fetch("/api/admin/media", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await refresh();
  }

  function copy(url: string) {
    const full = location.origin + url;
    navigator.clipboard?.writeText(full);
  }

  return (
    <>
      <div
        className={`ad-dropzone ${drag ? "drag" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); }}
        style={{ marginBottom: "1.5rem" }}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ margin: "0 auto .5rem" }}><path d="M12 16V4m0 0 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" /></svg>
        <div>{uploading ? "Качване…" : "Плъзнете снимки тук или кликнете за качване"}</div>
        <small>JPG, PNG, WebP, GIF, SVG — макс. 12 MB</small>
      </div>

      {loading ? (
        <p style={{ color: "var(--ad-muted)" }}>Зареждане…</p>
      ) : media.length === 0 ? (
        <div className="ad-empty">Все още няма качени снимки.</div>
      ) : (
        <div className="ad-media-grid">
          {media.map((m) => (
            <div className="ad-media" key={m.id}>
              <div className="ad-media__img"><img src={m.url} alt={m.alt} loading="lazy" /></div>
              <div className="ad-media__body">
                <div className="ad-media__name">{m.filename}</div>
                <div className="ad-media__name" style={{ marginTop: 2 }}>{m.width && m.height ? `${m.width}×${m.height}` : ""} · {(m.size / 1024).toFixed(0)} KB</div>
                <div className="ad-media__row">
                  <button className="ad-btn ad-btn--ghost" style={{ padding: ".35rem .6rem", fontSize: ".8rem" }} onClick={() => copy(m.url)}>Копирай URL</button>
                  <button className="ad-btn ad-btn--danger" style={{ padding: ".35rem .6rem", fontSize: ".8rem" }} onClick={() => remove(m.id)}>Изтрий</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
