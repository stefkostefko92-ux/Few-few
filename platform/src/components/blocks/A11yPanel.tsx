"use client";

import { useMemo, useState } from "react";
import type { Block } from "@/lib/blocks";
import { auditBlocks, a11ySummary } from "@/lib/a11y";

// Панел „Достъпност" в конструктора. Показва проблемите по WCAG на живо;
// клик върху проблем избира съответния блок в платното.
export function A11yPanel({
  blocks,
  onSelect,
}: {
  blocks: Block[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const issues = useMemo(() => auditBlocks(blocks), [blocks]);
  const { errors, warnings } = a11ySummary(issues);
  const clean = issues.length === 0;

  const badge = clean
    ? "text-green-400"
    : errors > 0
      ? "text-red-400"
      : "text-amber-400";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
        aria-expanded={open}
        title="Проверка за достъпност (WCAG 2.1 AA)"
      >
        <span aria-hidden>♿</span>
        <span className={badge}>
          {clean ? "Достъпно" : `${errors ? `${errors} ✕ ` : ""}${warnings ? `${warnings} ⚠` : ""}`.trim()}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-lg border border-ink-700 bg-ink-900 p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Достъпност (WCAG 2.1 AA)
            </h3>
            <button onClick={() => setOpen(false)} className="text-ink-500 hover:text-white">
              ✕
            </button>
          </div>

          {clean ? (
            <p className="text-sm text-green-400">
              Няма открити проблеми. Основните критерии за достъпност са спазени.
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {issues.map((it, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      if (it.blockId) onSelect(it.blockId);
                      setOpen(false);
                    }}
                    disabled={!it.blockId}
                    className="w-full rounded border border-ink-800 p-2 text-left hover:border-ink-600 disabled:cursor-default"
                  >
                    <span
                      className={`text-[11px] font-semibold ${
                        it.severity === "error" ? "text-red-400" : "text-amber-400"
                      }`}
                    >
                      {it.severity === "error" ? "✕ Грешка" : "⚠ Внимание"} · WCAG {it.wcag}
                    </span>
                    <p className="mt-0.5 text-xs leading-snug text-ink-200">{it.message}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] leading-snug text-ink-600">
            Цветовете на темата са проверени за контраст AA. Проверката е ориентир —
            за пълно съответствие ползвайте и екранен четец.
          </p>
        </div>
      )}
    </div>
  );
}
