"use client";

import { useState } from "react";
import { TEMPLATES } from "@/lib/templates";

// Избор на готов шаблон. „menu" — падащо меню в лентата; „cards" — карти за
// празното платно. И двете извикват onPick(id).
export function TemplatePicker({
  onPick,
  variant = "menu",
  hasBlocks = false,
}: {
  onPick: (id: string) => void;
  variant?: "menu" | "cards";
  hasBlocks?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (variant === "cards") {
    return (
      <div className="p-10">
        <h2 className="text-center text-lg font-semibold text-slate-700">
          Започнете с готов шаблон
        </h2>
        <p className="mb-6 text-center text-sm text-slate-400">
          Или добавете блокове отляво за празна страница.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-brand-400 hover:bg-white hover:shadow-md"
            >
              <div className="text-2xl" aria-hidden>{t.emoji}</div>
              <h3 className="mt-2 font-semibold text-slate-800">{t.name}</h3>
              <p className="mt-1 text-xs leading-snug text-slate-500">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost px-3 py-1.5 text-xs"
        aria-expanded={open}
      >
        📄 Шаблони
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-ink-700 bg-ink-900 p-2 shadow-xl">
          {hasBlocks && (
            <p className="mb-1 px-2 py-1 text-[11px] leading-snug text-amber-400">
              Шаблонът се добавя след текущите блокове.
            </p>
          )}
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onPick(t.id);
                setOpen(false);
              }}
              className="flex w-full items-start gap-2 rounded p-2 text-left hover:bg-ink-800"
            >
              <span className="text-lg" aria-hidden>{t.emoji}</span>
              <span>
                <span className="block text-sm text-ink-100">{t.name}</span>
                <span className="block text-[11px] leading-snug text-ink-500">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
