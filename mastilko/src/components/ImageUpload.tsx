"use client";

import { useRef, useState } from "react";

interface Props {
  /** Текущото изображение (data URL) или "". */
  value: string;
  onChange: (dataUrl: string) => void;
  label?: string;
  /** Максимална страна в пиксели след смаляване (за да пази localStorage). */
  maxSide?: number;
}

// Качва изображение (лого/снимка), смалява го в браузъра до разумен размер и
// го връща като data URL. Нищо не се качва на сървър — стои в localStorage.
export default function ImageUpload({
  value,
  onChange,
  label = "Лого / снимка",
  maxSide = 480,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Файлът не е изображение.");
      return;
    }
    try {
      const dataUrl = await shrink(file, maxSide);
      onChange(dataUrl);
    } catch {
      setError("Не успях да прочета изображението.");
    }
  }

  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="flex items-center gap-3">
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Качено изображение"
              className="h-12 w-12 rounded-lg border border-ink/15 object-contain"
            />
            <button type="button" onClick={() => onChange("")} className="btn-secondary text-sm">
              Махни
            </button>
          </>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary text-sm">
            📷 Качи изображение
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={label}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handle(f);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-tera-dark">{error}</p>}
    </div>
  );
}

/** Смалява изображение до maxSide и връща data URL (webp при поддръжка). */
function shrink(file: File, maxSide: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no ctx"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/webp", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load"));
    };
    img.src = url;
  });
}
