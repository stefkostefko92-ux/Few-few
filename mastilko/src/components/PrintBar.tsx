"use client";

import Icon from "@/components/Icon";
import ColorVisionToggle from "@/components/ColorVisionToggle";

interface Props {
  /** Кратко описание какво ще се отпечата, напр. „21 етикета на лист А4“. */
  summary: string;
}

// Лента с бутон за печат + съветите, без които домашният печат се разминава.
export default function PrintBar({ summary }: Props) {
  return (
    <div className="no-print card-warm flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">{summary}</p>
        <p className="text-sm text-ink-soft">
          В прозореца за печат избери <strong>мащаб 100%</strong> и{" "}
          <strong>полета: без</strong> — така размерите в милиметри са точни.
        </p>
        <div className="mt-2">
          <ColorVisionToggle />
        </div>
      </div>
      <button type="button" onClick={() => window.print()} className="btn-primary shrink-0">
        <Icon name="print" /> Принтирай / запази PDF
      </button>
    </div>
  );
}
