"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import ColorVisionToggle from "@/components/ColorVisionToggle";

interface Props {
  /** Кратко описание какво ще се отпечата, напр. „21 етикета на лист А4“. */
  summary: string;
}

// Лента с бутон за печат + съветите, без които домашният печат се разминава.
export default function PrintBar({ summary }: Props) {
  const [crop, setCrop] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("crop-on", crop);
    return () => document.documentElement.classList.remove("crop-on");
  }, [crop]);

  return (
    <div className="no-print card-warm flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">{summary}</p>
        <p className="text-sm text-ink-soft">
          В прозореца за печат избери <strong>мащаб 100%</strong> и{" "}
          <strong>полета: без</strong> — така размерите в милиметри са точни.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ColorVisionToggle />
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={crop}
              onChange={(e) => setCrop(e.target.checked)}
              className="h-4 w-4 accent-tera"
            />
            Резници за печатница
          </label>
        </div>
      </div>
      <button type="button" onClick={() => window.print()} className="btn-primary shrink-0">
        <Icon name="print" /> Принтирай / запази PDF
      </button>
    </div>
  );
}
