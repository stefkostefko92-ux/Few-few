"use client";

import { useState } from "react";

// Бутон „Създай ръководство“: копира предложения въпрос (за да може да се
// постави във формата) и праща формата към server action-а, който отбелязва
// нуждата като решена и отваря нов запис „Как да…“.
export function CreateGuideButton({ question }: { question: string }) {
  return (
    <button
      type="submit"
      onClick={() => {
        try {
          void navigator.clipboard?.writeText(question).catch(() => {});
        } catch {
          /* без достъп до клипборда — формата пак се отваря */
        }
      }}
      className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800"
    >
      Създай ръководство
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
      className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
      aria-live="polite"
    >
      {done ? "Копирано ✓" : "Копирай въпроса"}
    </button>
  );
}
