"use client";

import { useRef, useState } from "react";

// Бутон за качване на изображение → връща публичния URL през onUploaded.
export function UploadButton({
  onUploaded,
  label = "⬆ Качи снимка",
}: {
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || "Неуспешно качване.");
        return;
      }
      onUploaded(data.url);
    } catch {
      setError("Възникна грешка при качването.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="btn-ghost w-full px-2 py-1.5 text-xs disabled:opacity-50"
      >
        {busy ? "Качване…" : label}
      </button>
      {error && <p className="mt-1 text-[11px] text-amber-400">{error}</p>}
      <p className="mt-1 text-[11px] text-ink-600">PNG, JPEG, WEBP, GIF · до 5 MB</p>
    </div>
  );
}
