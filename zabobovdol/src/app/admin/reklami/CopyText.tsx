"use client";

import { useState } from "react";

// Бутон „Копирай“ за готовия текст към рекламодателя. Ако браузърът не позволи
// достъп до клипборда, текстът остава видим и може да се маркира ръчно.
export function CopyText({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("fail");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={copy} className="btn-secondary min-h-[44px]">
        Копирай текста
      </button>
      <span role="status" aria-live="polite" className="text-sm text-slate-600">
        {state === "ok" && "Копирано."}
        {state === "fail" && "Не успях да копирам — маркирайте текста ръчно."}
      </span>
    </div>
  );
}
