"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary no-print"
    >
      <Printer className="h-5 w-5" aria-hidden />
      Принтирай
    </button>
  );
}
