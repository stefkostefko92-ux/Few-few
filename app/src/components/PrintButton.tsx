"use client";

export function PrintButton({ label = "Разпечатай" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary no-print">
      🖨️ {label}
    </button>
  );
}
