"use client";

import { useState } from "react";
import {
  listUploadsAction,
  deleteUploadAction,
  type MediaItem,
} from "@/app/dashboard/media-actions";

// Медийна библиотека — избор на вече качено изображение (за преизползване) и
// изтриване. Отваря се като модал върху конструктора.
export function MediaLibrary({
  onPick,
  label = "📁 От библиотеката",
}: {
  onPick: (url: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      setItems(await listUploadsAction());
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    if (!open) load();
    setOpen((v) => !v);
  }

  async function del(url: string) {
    if (!confirm("Изтриване на файла от библиотеката?")) return;
    const r = await deleteUploadAction(url);
    if (r.ok) setItems((prev) => prev?.filter((i) => i.url !== url) ?? null);
  }

  return (
    <>
      <button type="button" className="btn-ghost w-full px-2 py-1.5 text-xs" onClick={toggle}>
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-ink-700 bg-ink-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Медийна библиотека</h3>
              <button onClick={() => setOpen(false)} className="text-ink-500 hover:text-white">
                ✕
              </button>
            </div>

            {busy && <p className="text-sm text-ink-400">Зареждане…</p>}
            {items && items.length === 0 && (
              <p className="text-sm text-ink-400">Още няма качени изображения.</p>
            )}
            {items && items.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {items.map((it) => (
                  <div key={it.url} className="group relative">
                    <button
                      type="button"
                      onClick={() => {
                        onPick(it.url);
                        setOpen(false);
                      }}
                      className="block w-full overflow-hidden rounded border border-ink-800 hover:border-brand-600"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.url} alt="" className="h-24 w-full object-cover" />
                    </button>
                    <button
                      type="button"
                      onClick={() => del(it.url)}
                      title="Изтрий"
                      className="absolute right-1 top-1 hidden rounded bg-ink-900/90 px-1.5 py-0.5 text-xs text-red-400 group-hover:block"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
