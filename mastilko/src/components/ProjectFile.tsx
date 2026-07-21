"use client";

import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import ShareButton from "@/components/ShareButton";

interface Props {
  /** Текущото състояние на редактора (записва се като JSON файл). */
  state: object;
  /** Извиква се с разчетените данни при качване на файл. */
  onLoad: (data: Record<string, unknown>) => void;
  /** Основа за името на файла, напр. „mastilko-vizitki“. */
  filename: string;
}

// Проектът живее само в браузъра (localStorage) — тези бутони позволяват да
// го свалиш като файл (бекъп / пренасяне на друго устройство) и да го качиш.
export default function ProjectFile({ state, onLoad, filename }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function download() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.mastilko.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload(file: File) {
    setMsg(null);
    try {
      const data: unknown = JSON.parse(await file.text());
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error("bad");
      }
      onLoad(data as Record<string, unknown>);
      setMsg("Проектът е зареден.");
    } catch {
      setMsg("Файлът не прилича на проект от Мастилко.");
    }
  }

  return (
    <div className="no-print card-warm p-4">
      <p className="text-sm text-ink-soft">
        Работата ти се пази само в този браузър. Свали си файл за всеки
        случай — или го качи на друго устройство.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={download} className="btn-secondary text-sm">
          <Icon name="download" className="h-4 w-4" /> Свали проекта
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn-secondary text-sm"
        >
          <Icon name="upload" className="h-4 w-4" /> Качи проект
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Файл с проект на Мастилко"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="mt-2">
        <ShareButton state={state} />
      </div>
      {msg && (
        <p aria-live="polite" className="mt-2 text-sm font-semibold text-ink-soft">
          {msg}
        </p>
      )}
    </div>
  );
}
