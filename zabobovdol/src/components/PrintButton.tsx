"use client";

import { Printer } from "lucide-react";

export function PrintButton({
  label = "Принтирай",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={(variant === "secondary" ? "btn-secondary" : "btn-primary") + " no-print"}
    >
      <Printer className="h-5 w-5" aria-hidden />
      {label}
    </button>
  );
}
