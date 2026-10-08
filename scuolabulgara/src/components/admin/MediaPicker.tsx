"use client";

import { useEffect, useState } from "react";
import { BUNDLED_MEDIA } from "@/lib/cms";

type Media = { id: string; url: string; filename: string; mime?: string; alt: string };

// Picture chooser: the school's own uploads first, then the photos that ship
// with the site — so a section can always be switched back to a bundled one.
export default function MediaPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      const res = await fetch("/api/admin/media");
      const json = await res.json();
      setMedia(((json.media || []) as Media[]).filter((m) => !m.mime?.startsWith("audio/") && m.mime !== "application/pdf"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  // Close on Escape, like any dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function upload(file: File) {
    setUploading(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) { await refresh(); onPick(json.media.url); }
      else setError(res.status === 415 ? "Този формат не се поддържа. Ползвайте JPG, PNG, WebP или GIF." : res.status === 413 ? "Файлът е твърде голям (макс. 12 MB)." : "Качването не успя.");
    } catch {
      setError("Качването не успя.");
    } finally {
      setUploading(false);
    }
  }

  const tile = (url: string, label: string, key: string) => (
    <button key={key} type="button" className="qba-media qba-media--pick" onClick={() => onPick(url)}>
      <div className="qba-media__img"><img src={url} alt="" loading="lazy" /></div>
      <div className="qba-media__body"><div className="qba-media__name">{label}</div></div>
    </button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Изберете снимка" className="qba-modal" onClick={onClose}>
      <div className="qba-modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="qba-modal__head">
          <b>Изберете снимка</b>
          <label className="qba-btn qba-btn--primary" style={{ cursor: "pointer" }}>
            {uploading ? "Качване…" : "Качи нова снимка"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
        {error && <p className="qba-modal__error" role="alert">{error}</p>}

        <h4 className="qba-modal__group">Вашите снимки</h4>
        {loading ? (
          <p className="qba-muted">Зареждане…</p>
        ) : media.length === 0 ? (
          <p className="qba-muted">Още няма качени. Натиснете „Качи нова снимка“ — снимката се оптимизира автоматично.</p>
        ) : (
          <div className="qba-media-grid">{media.map((m) => tile(m.url, m.filename, m.id))}</div>
        )}

        <h4 className="qba-modal__group">Снимки на сайта</h4>
        <div className="qba-media-grid">{BUNDLED_MEDIA.map((m) => tile(m.url, m.label, m.url))}</div>

        <div className="qba-modal__foot">
          <button className="qba-btn qba-btn--ghost" onClick={onClose} type="button">Затвори</button>
        </div>
      </div>
    </div>
  );
}
