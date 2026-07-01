"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/dashboard/sites/[slug]/actions";

// Бутон, който изпълнява подадено server action и показва резултата под себе си.
export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "ghost",
  confirm,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "ghost" | "danger";
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const cls =
    variant === "primary"
      ? "btn-primary"
      : variant === "danger"
        ? "btn-danger"
        : "btn-ghost";

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={cls}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setResult(await action()));
        }}
      >
        {pending ? (pendingLabel ?? "…") : label}
      </button>
      {result?.ok && <span className="text-xs text-green-400">{result.ok}</span>}
      {result?.error && (
        <span className="text-xs text-red-400">{result.error}</span>
      )}
    </span>
  );
}
