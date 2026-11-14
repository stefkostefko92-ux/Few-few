"use client";

// Малък UI kit — модали, значки, спинер. Стиловете са в globals.css (.btn/.card/.input).

import { useEffect, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-100/25 backdrop-blur-md p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card glass-strong w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[90vh] overflow-auto animate-scale-in shadow-pop`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] sticky top-0 z-10 rounded-t-[1.5rem] bg-white/[0.72] backdrop-blur-xl">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="btn-ghost !p-2" aria-label="Затвори">
            <X size={20} weight="bold" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-ink-800 text-ink-300",
    success: "bg-mint-600/15 text-mint-600",
    danger: "bg-coral-600/15 text-coral-600",
    warning: "bg-brand-600/15 text-brand-700",
    info: "bg-sky2-500/15 text-sky2-500",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-ink-400">
      <div className="size-5 rounded-full border-2 border-ink-600 border-t-brand-500 animate-spin" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink-300">{label}</span>
      {children}
    </label>
  );
}

/** Дребна помощна: показва грешка от API отговор. */
export async function apiJson<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? `Грешка ${res.status}`);
  }
  return json as T;
}

/**
 * Празно състояние: какво липсва и какво да се направи — не само сив текст.
 * `action` е бутон или връзка към следващата стъпка.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "py-8" : "py-14"} px-6`}>
      <div
        className="size-14 rounded-2xl flex items-center justify-center text-brand-700 mb-4"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.6))",
          boxShadow: "inset 0 1px 1px #fff, 0 10px 26px -12px rgba(23,32,58,.35)",
        }}
        aria-hidden
      >
        {icon}
      </div>
      <p className="font-semibold text-ink-100">{title}</p>
      {hint && <p className="text-sm text-ink-400 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
