'use client';

// Печат/„Запази като PDF" през нативния диалог на браузъра — нула
// зависимости. Не се показва при печат (клас print:hidden).
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-linketto-600 px-5 py-2 text-sm font-semibold text-white hover:bg-linketto-700 print:hidden"
    >
      {label}
    </button>
  );
}
